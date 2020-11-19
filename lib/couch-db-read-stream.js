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
