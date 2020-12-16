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