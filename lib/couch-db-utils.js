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
     */
    static async replicateWithoutDesignDocs(options) {
        assert(options, "`options` is required");
        assert(options.source, "`options.source` is required");
        assert(options.target, "`options.target` is required");

        const source = new PouchDb(options.source);
        const target = new PouchDb(options.target);

        await source.replicate.to(target, {
            filter: function(doc) {
                return !doc._id.startsWith("_design/");
            }
        });
    }

    /**
     * Mutates all documents in a given database. Documents will be skipped if
     * any of the following conditions are true:
     *   1. The document is a design document.
     *   2. The mutator does not change the document.
     *   3. A validator is provided and the document is invalid.
     *   4. options.verifyIdempotent is true and the mutation is not idempotent.
     *
     * @param {object} options
     * @param {string} options.location - Database location.
     * @param {Function} options.mutator - Mutator function.
     * @param {Function} options.validator - Optional validation function.
     * @param {boolean} options.verifyIdempotent - Verify that mutations are
     *     idempotent. Does not apply by default.
     * @param {object} options.eventEmitter - Optional event emitter for
     *     reporting progress.
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

                const message = [
                    `${stats.written + stats.ignored}/${stats.total}`,
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

                        let write = original !== transformed;

                        if (write && options.validator) {
                            write = options.validator(transformed);
                        }

                        if (write && options.verifyIdempotent) {
                            options.mutator(doc);
                            write = transformed === jsonStableStringify(doc);
                        }

                        return write;
                    }
                }).then(write => {
                    if (write) {
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
                reportProgess();
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
