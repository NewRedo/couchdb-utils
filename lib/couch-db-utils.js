"use strict";

const assert = require("assert");
const PouchDb = require("pouchdb");

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
     * Mutates all documents in a given database.
     *
     * @param {object} options
     * @param {string} options.location - Database location.
     * @param {Function} options.mutator - Mutator function.
     */
    static async mutateAllDocs(options) {
        console.warn("CouchDbUtils: mutateAllDocs not implemented");
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
