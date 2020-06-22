# Multer Minio

Streaming multer storage engine for minio.

This project is mostly an integration piece for existing code samples from Multer's [storage engine documentation](https://github.com/expressjs/multer/blob/master/StorageEngine.md) with [s3fs](https://github.com/RiptideElements/s3fs) as the substitution piece for file system. Existing solutions I found required buffering the multipart uploads into the actual filesystem which is difficult to scale.

## Installation

```sh
yarn add multer-minio
```

## Usage

```javascript
const Minio = require('minio');
const express = require('express');
const multer = require('multer');
const multerS3 = require('multer-minio');

const app = express();

const minioClient = new Minio.Client({
  /* ... */
});

const upload = multer({
  storage: multerMinio({
    minio: minioClient,
    bucketName: 'some-bucket',
    metaData: function (req, file, cb) {
      cb(null, {fieldName: file.fieldname});
    },
    objectName: function (req, file, cb) {
      cb(null, Date.now().toString());
    },
  }),
});

app.post('/upload', upload.array('photos', 3), function (req, res, next) {
  res.send('Successfully uploaded ' + req.files.length + ' files!');
});
```

### File information

Each file contains the following information exposed by `multer-minio`:

| Key           | Description                            | Note        |
| ------------- | -------------------------------------- | ----------- |
| `size`        | Size of the file in bytes              |
| `bucketName`  | The bucket used to store the file      | `S3Storage` |
| `objectName`  | The name of the object                 | `S3Storage` |
| `contentType` | The `mimetype` used to upload the file | `S3Storage` |
| `metaData`    | The `metaData` object to be sent to S3 | `S3Storage` |
| `etag`        | The `etag`of the uploaded file in S3   | `S3Storage` |

## Setting MetaData

The `metaData` option is a callback that accepts the request and file, and returns a metaData object to be saved to S3.

Here is an example that stores all fields in the request body as metaData, and uses an `id` param as the objectName:

```javascript
const opts = {
  minio: minioClient,
  bucketName: config.originalsBucketName,
  metaData: function (req, file, cb) {
    cb(null, Object.assign({}, req.body));
  },
  objectName: function (req, file, cb) {
    cb(null, req.params.id + '.jpg');
  },
};
```

## Setting Custom Content-Type

The optional `contentType` option can be used to set Content/mime type of the file. By default the content type is set to `application/octet-stream`. If you want multer-minio to automatically find the content-type of the file, use the `multerS3.AUTO_CONTENT_TYPE` constant. Here is an example that will detect the content type of the file being uploaded.

```javascript
const upload = multer({
  storage: multerS3({
    minio: minioClient,
    bucketName: 'some-bucket',
    contentType: multerS3.AUTO_CONTENT_TYPE,
    objectName: function (req, file, cb) {
      cb(null, Date.now().toString());
    },
  }),
});
```

You may also use a function as the `contentType`, which should be of the form `function(req, file, cb)`.

## Testing

The tests mock all access to S3 and can be run completely offline.

```sh
npm test
```
