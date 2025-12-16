const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl: getSignedUrlFromS3 } = require('@aws-sdk/s3-request-presigner');
require('dotenv').config();
const httpStatus = require('http-status');
const config = require('../config/config');
const { getSuccessResponse } = require('./Response');
const crypto = require('crypto');

const logger = require('../logger')(module);

const getDataHash = (data) => {
  try {
    const hash = crypto.createHash('sha256');
    hash.update(data);
    return hash.digest('hex');
  } catch (error) {
    console.log(`Error occurred while creating file data hash: Error: ${error}`);
    return null;
  }
};

const s3Client = new S3Client({
  region: 'us-east-1',
  credentials: {
    accessKeyId: config.awsAccessKey,
    secretAccessKey: config.awsSecretAccess,
  },
});

// 5MB Max File size allowed
const fileSizeLimit = 5242880;

/**
 * destination - Directory where all the files will be saved
 * filename - Overwrites file name with orgId_logo / orgId_cover
 * limits - File size limit
 * fileFilter - Filters file based on mimetype
 */
const upload = multer({
  storage: multer.diskStorage({
    destination: function (_req, _file, cb) {
      cb(null, path.resolve(__dirname, '../../', 'uploads'));
    },
    filename: (req, file, cb) => {
      cb(null, `${file.fieldname}`);
    },
  }),
  limits: { fileSize: fileSizeLimit },
  fileFilter: (req, file, cb) => {
    console.log('MIME type :: ', file.mimetype);
    logger.info({ userInfo: req.loggerInfo, method: 'Upload', fileMimeType: file.mimetype });
    if (file.mimetype == 'application/pdf') {
      cb(null, !0);
    } else {
      return cb(new Error('Only .pdf format allowed!'));
    }
  },
});

const documentUpload = upload.fields([{ name: 'file', maxCount: 1 }]);

const validate = require('../middlewares/validate');
const agreementValidation = require('../validations/record.validation');

const uploadFileToS3 = async (req, res, next) => {
  logger.info({ userInfo: req.loggerInfo, method: 'uploadFileToS3' });
  documentUpload(req, res, async (err) => {
    try {
      if (err) {
        logger.error({ userInfo: req.loggerInfo, method: 'uploadFileToS3', error: 'Error in imageUpload : ' + err });
        if (err.message == 'Unexpected field') {
          err.message = 'Invalid number of files / Invalid key in form data';
        }
        return res.status(httpStatus.FORBIDDEN).send(getSuccessResponse(httpStatus.FORBIDDEN, err.message));
      }
      if (req.body.isUpdate && !req.files?.length) {
        next();
      } else {
        const files = req.files;
        if (!files?.file?.length) {
          console.log('No files selected');
          logger.error({ userInfo: req.loggerInfo, method: 'uploadFileToS3', error: 'No files selected' });
          req.body.fileMetadata = null;
          return next();
        }
        if (req.files.file) {
          const org = `org${req.user.orgId}`;
          let fileMetadata = await uploadFile(req.files.file[0], org);
          logger.info({ userInfo: req.loggerInfo, method: 'uploadFileToS3', info: fileMetadata });
          req.body.fileMetadata = fileMetadata;
        }
        next();
      }
    } catch (error) {
      logger.error({ userInfo: req.loggerInfo, method: 'uploadDocument', error: error });
      return res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .send(getSuccessResponse(httpStatus.INTERNAL_SERVER_ERROR, error.message));
    }
  });
};

const BUCKET_NAME = config.awsPrivateBucketName;
const BUCKET_ACL = 'authenticated-read';
const BUCKET_URL = `https://${BUCKET_NAME}.s3.amazonaws.com`;
// S3 url expiry timeIn seconds
const URL_EXPIRY_TIME = 3600;

const getSignedUrl = async (docID, orgName) => {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: `${orgName}/${docID}`,
  });
  return getSignedUrlFromS3(s3Client, command, { expiresIn: URL_EXPIRY_TIME });
};

const uploadFile = async (data, orgName) => {
  const fileData = fs.readFileSync(data.path);
  const originalFileName = data.originalname;
  let dataHash = getDataHash(fileData);
  const fileName = `${dataHash}-${originalFileName}`;
  const fileKey = `${orgName}/${fileName}`;
  const params = { Bucket: BUCKET_NAME, Key: fileKey, Body: fileData };
  const fileUrl = `${BUCKET_URL}/${encodeURIComponent(fileKey)}`;
  await s3Client.send(new PutObjectCommand(params));
  return { id: fileName, orgName, name: originalFileName.replace(/\.[^/.]+$/, ''), url: fileUrl, contentHash: dataHash };
};

const deleteFile = async (key, orgName) => {
  const params = { Bucket: BUCKET_NAME, Key: `${orgName}/${key}` };
  await s3Client.send(new DeleteObjectCommand(params));
  return true;
};

// Simple multer instance for single file uploads by doctors
const singleFileUpload = multer({
  storage: multer.diskStorage({
    destination: function (_req, _file, cb) {
      cb(null, path.resolve(__dirname, '../../', 'uploads'));
    },
    filename: (_req, file, cb) => {
      // Use a unique name to avoid conflicts, though it's temporary
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  limits: { fileSize: fileSizeLimit },
  fileFilter: (req, file, cb) => {
    if (file.mimetype == 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only .pdf format allowed!'), false);
    }
  },
}).single('file'); // Expects a field named 'file'

const uploadFileForDoctor = async (file, user) => {
  const orgName = `org${user.orgId}`;
  const fileData = fs.readFileSync(file.path);
  const originalFileName = file.originalname;
  let dataHash = getDataHash(fileData);

  // Using a hash in the key is good practice to avoid overwrites
  const fileKey = `${orgName}/${dataHash}-${originalFileName}`;

  const params = { Bucket: BUCKET_NAME, Key: fileKey, Body: fileData };

  await s3Client.send(new PutObjectCommand(params));

  // Clean up the temporary file from the 'uploads' directory
  fs.unlinkSync(file.path);

  return {
    s3ObjectKey: fileKey,
    fileName: originalFileName,
  };
};

// Middleware for doctor creating a record with an optional file
const doctorRecordUploader = multer({
  storage: multer.diskStorage({
    destination: function (_req, _file, cb) {
      cb(null, path.resolve(__dirname, '../../', 'uploads'));
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  limits: { fileSize: fileSizeLimit },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only .pdf format allowed!'), false);
    }
  },
}).single('file');

const processDoctorRecordUpload = (req, res, next) => {
  doctorRecordUploader(req, res, async (err) => {
    try {
      if (err) {
        return res.status(httpStatus.BAD_REQUEST).send(getSuccessResponse(httpStatus.BAD_REQUEST, err.message, null));
      }
      // If there's no file, that's okay. Just continue.
      if (!req.file) {
        return next();
      }

      const orgName = `org${req.user.orgId}`;
      const fileData = fs.readFileSync(req.file.path);
      const originalFileName = req.file.originalname;
      const dataHash = getDataHash(fileData);
      const fileKey = `${orgName}/${dataHash}-${originalFileName}`;

      const params = { Bucket: BUCKET_NAME, Key: fileKey, Body: fileData };
      await s3Client.send(new PutObjectCommand(params));

      fs.unlinkSync(req.file.path);

      req.body.s3ObjectKey = fileKey;
      req.body.fileName = originalFileName;

      next();
    } catch (error) {
      logger.error({ userInfo: req.loggerInfo, method: 'processDoctorRecordUpload', error });
      return res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .send(getSuccessResponse(httpStatus.INTERNAL_SERVER_ERROR, 'File processing failed.', null));
    }
  });
};

module.exports = {
  uploadFileToS3,
  getSignedUrl,
  documentUpload,
  uploadFile,
  deleteFile,
  singleFileUpload,
  uploadFileForDoctor,
  processDoctorRecordUpload,
};
