/*
 * Extracts conflicting documents in json files and puts the files in the 
 * current working directory.
 * 
 * Syntax:
 * node conflicts.js <database url>
 */

"use strict";

const PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-find'));
const fs = require('fs');
const { strict } = require('assert');

const path = process.argv[2];
const db = new PouchDB(path);

const LIMIT = 100;

(async function() {
    const conflicts = await db.find({
        "selector": {
            "_conflicts": { "$exists": true}
        }, 
        "conflicts": true, 
        "fields": [ "_id", "_rev", "_conflicts" ], 
        "limit": LIMIT
    });
    console.warn(`${conflicts.docs.length} documents found.`);
    if (conflicts.docs.length === LIMIT) {
        console.warn(`Limit of ${LIMIT} reached, there may be more.`);
    }
    for(let doc_id of conflicts.docs) {
        const doc = await db.get(doc_id._id, {rev:doc_id._rev});
        const filename = `${doc._id} rev-${doc._rev} primary.json`;
        fs.writeFileSync(filename, JSON.stringify(doc, null, 4));
        console.warn(`Wrote ${filename}.`);
        
        for (let conflict of doc_id._conflicts) {
            const doc = await db.get(doc_id._id, {rev:conflict});
            const filename = `${doc._id} rev-${doc._rev} conflict.json`;
            fs.writeFileSync(filename, JSON.stringify(doc, null, 4));
            console.warn(`Wrote ${filename}.`);
        }
    }
})().catch(console.warn);
