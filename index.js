var crypto = require('crypto');
var stream = require('stream');
var fileType = require('file-type');
var isSvg = require('is-svg');
var parallel = require('run-parallel');

function staticValue(value) {
  return function (req, file, cb) {
    cb(null, value);
  };
}

var defaultContentType = staticValue('application/octet-stream');

var defaultMetaData = staticValue(null);

function defaultKey(req, file, cb) {
  crypto.randomBytes(16, function (err, raw) {
    cb(err, err ? undefined : raw.toString('hex'));
  });
}

// TODO: is not working, will hang up
function autoContentType(req, file, cb) {
  file.stream.once('data', function (firstChunk) {
    var type = fileType(firstChunk);
    var mime;

    if (type) {
      mime = type.mime;
    } else if (isSvg(firstChunk)) {
      mime = 'image/svg+xml';
    } else {
      mime = 'application/octet-stream';
    }

    var outStream = new stream.PassThrough();

    outStream.write(firstChunk);
    file.stream.pipe(outStream);

    cb(null, mime, outStream);
  });
}

function collect(storage, req, file, cb) {
  parallel(
    [
      storage.getBucketName.bind(storage, req, file),
      storage.getObjectName.bind(storage, req, file),
      storage.getMetaData.bind(storage, req, file),
    ],
    function (err, values) {
      if (err) return cb(err);

      storage.getContentType(req, file, function (
        err,
        contentType,
        replacementStream
      ) {
        if (err) return cb(err);

        cb.call(storage, null, {
          bucketName: values[0],
          objectName: values[1],
          metaData: values[2],
          contentType: contentType,
        });
      });
    }
  );
}

function MinioStorage(opts) {
  switch (typeof opts.minio) {
    case 'object':
      this.minio = opts.minio;
      break;
    default:
      throw new TypeError('Expected opts.minio to be object');
  }

  switch (typeof opts.bucketName) {
    case 'function':
      this.getBucketName = opts.bucketName;
      break;
    case 'string':
      this.getBucketName = staticValue(opts.bucketName);
      break;
    case 'undefined':
      throw new Error('bucketName is required');
    default:
      throw new TypeError(
        'Expected opts.bucketName to be undefined, string or function'
      );
  }

  switch (typeof opts.objectName) {
    case 'function':
      this.getObjectName = opts.objectName;
      break;
    case 'undefined':
      this.getObjectName = defaultKey;
      break;
    default:
      throw new TypeError(
        'Expected opts.objectName to be undefined or function'
      );
  }

  switch (typeof opts.contentType) {
    case 'function':
      this.getContentType = opts.contentType;
      break;
    case 'undefined':
      this.getContentType = defaultContentType;
      break;
    default:
      throw new TypeError(
        'Expected opts.contentType to be undefined or function'
      );
  }

  switch (typeof opts.metaData) {
    case 'function':
      this.getMetaData = opts.metaData;
      break;
    case 'undefined':
      this.getMetaData = defaultMetaData;
      break;
    default:
      throw new TypeError('Expected opts.metadata to be undefined or function');
  }
}

MinioStorage.prototype._handleFile = function (req, file, cb) {
  collect(this, req, file, function (err, opts) {
    if (err) return cb(err);

    var size = 0;

    var params = {
      bucketName: opts.bucketName,
      objectName: opts.objectName,
      stream: opts.replacementStream || file.stream,
      metaData: opts.metaData,
    };

    this.minio.putObject(
      params.bucketName,
      params.objectName,
      params.stream,
      params.metaData,
      (err, etag) => {
        if (err) return cb(err);

        this.minio.getObject(
          params.bucketName,
          params.objectName,
          (err, dataStream) => {
            if (err) {
              return cb(err);
            }
            dataStream.on('data', function (chunk) {
              size += chunk.length;
            });
            dataStream.on('end', function () {
              cb(null, {
                size: size,
                bucketName: opts.bucketName,
                objectName: opts.objectName,
                metaData: opts.metaData,
                etag: etag,
              });
            });

            dataStream.on('error', function (err) {
              return cb(err);
            });
          }
        );
      }
    );
  });
};

MinioStorage.prototype._removeFile = function (req, file, cb) {
  this.minio.removeObject(file.bucketName, file.objectName, cb);
};

module.exports = function (opts) {
  return new MinioStorage(opts);
};

module.exports.AUTO_CONTENT_TYPE = autoContentType;
module.exports.DEFAULT_CONTENT_TYPE = defaultContentType;
