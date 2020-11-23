# couch-db-utils

## Usage

```javascript
const CouchDbUtils = require("couch-db-utils");
```

## API Documentation

<a name="CouchDbUtils"></a>

### CouchDbUtils
Utilities for CouchDB databases.

**Kind**: global class  

* [CouchDbUtils](#CouchDbUtils)
    * [.replicateWithoutDesignDocs(options)](#CouchDbUtils.replicateWithoutDesignDocs)
    * [.mutateAllDocs(options)](#CouchDbUtils.mutateAllDocs) ⇒ <code>Promise</code>
    * [.refreshViews(options)](#CouchDbUtils.refreshViews)

<a name="CouchDbUtils.replicateWithoutDesignDocs"></a>

#### CouchDbUtils.replicateWithoutDesignDocs(options)
Performs a one-time replication, filtering out design documents.

**Kind**: static method of [<code>CouchDbUtils</code>](#CouchDbUtils)  

| Param | Type | Description |
| --- | --- | --- |
| options | <code>object</code> |  |
| options.source | <code>string</code> | Location of source CouchDB database. |
| options.target | <code>string</code> | Location of target CouchDB database. |
| options.eventEmitter | <code>object</code> | Optional event emitter for     reporting progress. If provided, it will periodically emit "progress"     events with a single "message" string. |

<a name="CouchDbUtils.mutateAllDocs"></a>

#### CouchDbUtils.mutateAllDocs(options) ⇒ <code>Promise</code>
Mutates all documents in a given database. Will throw an error and halt if
any of the following conditions are true:
  1. A validator is provided and the document is invalid.
  2. options.verifyIdempotent is true and the mutation is not idempotent.

**Kind**: static method of [<code>CouchDbUtils</code>](#CouchDbUtils)  
**Returns**: <code>Promise</code> - Resolves upon successful mutation of all documents.  

| Param | Type | Description |
| --- | --- | --- |
| options | <code>object</code> |  |
| options.location | <code>string</code> | Database location. |
| options.mutator | <code>function</code> | Mutator function. |
| options.validator | <code>function</code> | Optional validation function. |
| options.verifyIdempotent | <code>boolean</code> | Verify that mutations are     idempotent. Does not apply by default. |
| options.eventEmitter | <code>object</code> | Optional event emitter for     reporting progress. If provided, it will periodically emit "progress"     events with a single "message" string. |
| options.reportFrequency | <code>number</code> | Progress report frequency, in     number of documents. Defaults to 1. |

<a name="CouchDbUtils.refreshViews"></a>

#### CouchDbUtils.refreshViews(options)
Refreshes all views in a database.

**Kind**: static method of [<code>CouchDbUtils</code>](#CouchDbUtils)  

| Param | Type | Description |
| --- | --- | --- |
| options | <code>object</code> |  |
| options.location | <code>string</code> | Database location. |


