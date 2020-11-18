"use strict";

const stream = require("stream");

/** A readable stream for streaming data out of CouchDB. */
class CouchDbReadStream extends stream.Readable {

    /**
     * Creates a new CouchDbReadStream.
     *
     * @param {object} db - PouchDb instance.
     */
    constructor(db) {
        super({
            objectMode: true
        });
        this._db = db;
        this._key = null;
    }

    /** Emits chunks. */
    _read(size) {
        // Avoid double-calling before we know the keys to process docs in
        // sequence.
        if (this.reading) return;
        this.reading = true;

        Promise.resolve({
            include_docs: true,
            startkey: this._key,
            skip: (this._key == null ? 0 : 1),
            limit: size || 10
        }).then(opts => {
            return this._db.allDocs(opts)
        }).then(result => {
            this.emit("total", result.total_rows);
            this.reading = false;
            if (result.rows.length === 0) {
                this.push(null);
            } else {
                var lastPushResult = false;

                this._key = result.rows[result.rows.length - 1].id;
                result.rows.forEach(row => {
                    lastPushResult = this.push(row.doc);
                });

                // If the reader is still calling for more, continue.
                if (lastPushResult) {
                    process.nextTick(() => this._read(10));
                }
            }
        }).catch(err => this.emit("error", err));
    }
}

module.exports = CouchDbReadStream;
