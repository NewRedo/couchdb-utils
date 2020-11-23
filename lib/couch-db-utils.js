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
const jsonStableStringify = require("json-stable-stringify");
const mississippi = require("mississippi");
const PouchDb = require("pouchdb");

// Local modules.
const CouchDbReadStream = require("./couch-db-read-stream");
const CouchDbWriteStream = require("./couch-db-write-stream");

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

        const source = new PouchDb(options.source);
        const target = new PouchDb(options.target);

        const sourceInfo = await source.info();

        const stats = {
            total: sourceInfo.doc_count,
            written: 0,
            ignored: 0
        };

        function reportProgress() {
            if (!options.eventEmitter) {
                return;
            }

            const processed = stats.written + stats.ignored;
            const msg = [
                `${processed}/${stats.total}`,
                `${stats.written} replicated`,
                `${stats.ignored} ignored`
            ].join(", ");

            options.eventEmitter.emit("progress", msg);
        }

        const replication = source.replicate.to(target, {
            filter: function(doc) {
                if (doc._id.startsWith("_design/")) {
                    stats.ignored++;
                    return false;
                }
                return true;
            }
        });

        replication.on("change", info => {
            stats.written = info.docs_written;
            reportProgress();
        });

        replication.on("complete", info => {
            stats.written = info.docs_written;
            reportProgress();
        });

        await replication;
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
     */
    static async refreshViews(options) {
        assert(options, "`options` is required");
        assert(options.location, "`options.location` is required");

        const db = new PouchDb(options.location);

        const result = await db.allDocs({
            startkey: "_design/",
            endkey: "_design0",
            include_docs: true
        });

        for (let { doc } of result.rows) {
            const docName = doc._id.match(/_design\/(.*)/)[1];

            for (let viewName in doc.views) {
                await db.query(`${docName}/${viewName}`, {
                    limit: 1
                });
            }
        }
    }

}

module.exports = CouchDbUtils;
