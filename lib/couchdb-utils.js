/*
MIT Licence

Copyright (c) 2020 NewRedo Ltd

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

"use strict";

// Global modules.
const assert = require("assert");
const fetch = require("node-fetch");
const jsonStableStringify = require("json-stable-stringify");
const mississippi = require("mississippi");
const PouchDb = require("pouchdb");
const uuid = require("uuid").v4;
const { URL } = require("url");

// Local modules.
const CouchDbReadStream = require("./couchdb-read-stream");
const CouchDbWriteStream = require("./couchdb-write-stream");

/** Utilities for CouchDB databases. */
class CouchDbUtils {

    /**
     * Performs a one-time replication, filtering out design documents.
     *
     * @param {object} options
     * @param {string} options.source - Location of source CouchDB database.
     * @param {string} options.target - Location of target CouchDB database.
     * @param {object} options.eventEmitter - Optional event emitter for
     *     reporting progress. If provided, it will periodically emit "progress"
     *     events with a single "message" string.
     */
    static async replicateWithoutDesignDocs(options) {
        assert(options, "`options` is required");
        assert(options.source, "`options.source` is required");
        assert(options.target, "`options.target` is required");

        const id = await CouchDbUtils._startReplication(options.source, options.target);

        let completed = false;
        while (!completed) {
            const task = await CouchDbUtils._getReplicationTask(options.target, id);
            if (task) {
                if (options.eventEmitter) {
                    options.eventEmitter.emit("progress", `${task.docs_written} replicated`);
                }
            }
            else {
                const doc = await CouchDbUtils._getReplication(options.target, id);
                completed = doc.state === "completed"; // TODO: Check for failure.
                if (options.eventEmitter && doc.info) {
                    options.eventEmitter.emit("progress", `${doc.info.docs_written} replicated`);
                }
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    /**
     * Kicks off a replication job.
     *
     * @param {string} source - Location of source CouchDB database.
     * @param {string} target - Location of target CouchDB database.
     *
     * @returns {string} _id of replication document.
     */
    static async _startReplication(source, target) {
        const _id = uuid();

        const targetServerUrl = CouchDbUtils._getServerUrl(target);
        const result = await CouchDbUtils._getJson(`${targetServerUrl}/_replicator`, {
            headers: {
                "Content-Type": "application/json"
            },
            method: "POST",
            body: JSON.stringify({
                _id,
                continuous: false,
                create_target: true,
                source,
                target,
                selector: {
                    $not: {
                        _id: {
                            $regex: "^_design"
                        }
                    }
                }
            })
        });

        if (result.error) {
            throw new Error(`Failed to start replication: ${result.reason}`);
        }

        return _id;
    }

    /**
     * Retrieves a replication document.
     *
     * @param {string} dbLocation - CouchDB database location. TODO: Should be base URL.
     * @param {string} replicationId - _id of replication document.
     */
    static async _getReplication(dbLocation, replicationId) {
        const serverUrl = CouchDbUtils._getServerUrl(dbLocation);
        return CouchDbUtils._getJson(
            `${serverUrl}/_scheduler/docs/_replicator/${replicationId}`
        );
    }

    /**
     * Retrieves an active replication task.
     *
     * @param {string} dbLocation - CouchDB database location. TODO: Should be base URL.
     * @param {string} replicationId - _id of replication document.
     *
     * @returns {object|null} The replication task. `null` if it doesn't exist.
     */
    static async _getReplicationTask(dbLocation, replicationId) {
        const baseUrl = CouchDbUtils._getServerUrl(dbLocation);
        const tasks = await CouchDbUtils._getJson(`${baseUrl}/_active_tasks`);
        return tasks.find(t => t.doc_id === replicationId);
    }

    /**
     * Mutates all documents in a given database. Will throw an error and halt if
     * any of the following conditions are true:
     *   1. A validator is provided and the document is invalid.
     *   2. options.verifyIdempotent is true and the mutation is not idempotent.
     *
     * @param {object} options
     * @param {string} options.location - Database location.
     * @param {Function} options.mutator - Mutator function.
     * @param {Function} options.validator - Optional validation function.
     * @param {boolean} options.verifyIdempotent - Verify that mutations are
     *     idempotent. Does not apply by default.
     * @param {object} options.eventEmitter - Optional event emitter for
     *     reporting progress. If provided, it will periodically emit "progress"
     *     events with a single "message" string.
     * @param {number} options.reportFrequency - Progress report frequency, in
     *     number of documents. Defaults to 1.
     *
     * @returns {Promise} Resolves upon successful mutation of all documents.
     */
    static mutateAllDocs(options) {
        assert(options, "`options` is required");
        assert(options.location, "`options.location` is required");
        assert(options.mutator, "`options.mutator` is required");

        return new Promise((resolve, reject) => {
            const stats = {
                total: 0,
                ignored: 0,
                written: 0
            };

            const db = new PouchDb(options.location);

            const source = new CouchDbReadStream(db);
            source.on("total", val => stats.total = val);

            function reportProgress() {
                if (!options.eventEmitter) {
                    return;
                }

                const reportFrequency = options.reportFrequency || 1;
                const processed = stats.written + stats.ignored;
                const skipReport = (
                    processed !== stats.total &&
                    (processed % reportFrequency) !== 0
                );
                if (skipReport) {
                    return;
                }

                const message = [
                    `${processed}/${stats.total}`,
                    `${stats.written} written`,
                    `${stats.ignored} ignored`
                ].join(", ");

                options.eventEmitter.emit("progress", message);
            }

            const transform = mississippi.through.obj((chunk, encoding, callback) => {
                Promise.resolve(chunk).then((doc) => {
                    if (doc._id.startsWith("_design/")) {
                        // Ignore design documents.
                        return false;
                    } else {
                        const original = jsonStableStringify(doc);
                        options.mutator(doc);
                        const transformed = jsonStableStringify(doc);

                        // Skip documents that haven't changed.
                        if (original === transformed) {
                            return false;
                        }

                        if (
                            options.validator &&
                            !options.validator(doc)
                        ) {
                            throw new Error(`Validation failed for ${doc._id}`);
                        }

                        if (options.verifyIdempotent) {
                            options.mutator(doc);

                            if (transformed !== jsonStableStringify(doc)) {
                                throw new Error(
                                    `Idempotency check failed for ${doc._id}`
                                );
                            }
                        }

                        return true;
                    }
                }).then(changed => {
                    if (changed) {
                        callback(null, chunk);
                    } else {
                        stats.ignored++;
                        reportProgress();
                        callback(null);
                    }
                }).catch(callback);
            });

            const target = new CouchDbWriteStream(db);
            target.on("document-write", () => {
                stats.written++;
                reportProgress();
            });

            mississippi.pipe(
                source,
                transform,
                target,
                (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        });
    }

    /**
     * Refreshes all views in a database.
     *
     * @param {object} options
     * @param {string} options.location - Database location.
     * @param {object} options.eventEmitter - Optional event emitter for
     *     reporting progress. If provided, it will periodically emit "progress"
     *     events with a single "message" string.
     */
    static async refreshViews(options) {
        assert(options, "`options` is required");
        assert(options.location, "`options.location` is required");

        const serverUrl = CouchDbUtils._getServerUrl(options.location);

        const { rows } = await CouchDbUtils._getJson(
            `${options.location}/_design_docs?include_docs=true`
        );
        const designDocs = rows.map(row => row.doc);

        for (let doc of designDocs) {
            for (let viewName in doc.views) {
                // Initiate the view refresh.
                let refreshing = true;
                const query = CouchDbUtils._getJson(
                    `${options.location}/${doc._id}/_view/${viewName}?limit=1`
                ).then(() => {
                    refreshing = false;
                });

                while (refreshing) {
                    const tasks = await CouchDbUtils._getJson(
                        `${serverUrl}/_active_tasks`
                    );
                    const indexers = tasks.filter(t => t.type === "indexer");

                    if (indexers.length && options.eventEmitter) {
                        let percentage = 0;
                        for (let indexer of indexers) {
                            percentage += indexer.progress;
                        }
                        percentage /= indexers.length;
                        percentage = Math.round(percentage);
                        options.eventEmitter.emit(
                            "progress",
                            `${percentage}% ${doc._id}/${viewName}`
                        );
                    }

                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }
        }
    }

    static _getServerUrl(databaseLocation) {
        return (new URL(databaseLocation)).origin;
    }

    static async _getJson(url, options) {
        const res = await fetch(url, options);
        return res.json();
    }

}

module.exports = CouchDbUtils;
