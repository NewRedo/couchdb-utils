var PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-find'));
var fs = require('fs');

var path = process.argv.slice(2);
var db = new PouchDB(path[0]);

(async function() {
    const conflicts = await db.find({
        "selector": {
            "_conflicts": { "$exists": true}
        }, 
        "conflicts": true, 
        "fields": [ "_id", "_rev", "_conflicts" ], 
        "limit": 100 
    });
    for(let doc_id of conflicts.docs) {
        const doc = await db.get(doc_id._id);
        filename = doc_id._id + ' rev:' + doc_id._rev + ' primary' + '.txt';
        fs.writeFileSync(filename, JSON.stringify(doc, null, 4), function(err) {
            if(err) return console.error(err);
        });
        
        for (let conflict of doc_id._conflicts) {
            console.log(conflict);

            cfilename = doc_id._id + ' rev:' + doc_id._rev + ' conflict' + conflict + '.txt';
            const conf = await db.get(doc_id._id, {rev:conflict});
            fs.writeFileSync(cfilename, JSON.stringify(conf, null, 4), function(err) {
                if(err) return console.error(err);
            });
        }
    }
})().catch(console.warn);