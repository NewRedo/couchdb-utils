"use strict";

const stream = require("stream");

/** A writable stream for streaming data into CouchDB. */
class CouchDbWriteStream extends stream.Writable {

    /**
     * Creates a new CouchDbWriteStream.
     *
     * @param {object} db - PouchDb instance.
     */
    constructor(db) {
        super({
            objectMode: true
        });
        this._db = db;
    }

    /** Writes a single chunk. */
    _write(chunk, encoding, callback) {
        this._db.put(chunk, (err) => {
            if (!err) {
                this.emit("document-write");
            }
            callback(err);
        });
    }
}

module.exports = CouchDbWriteStream;
