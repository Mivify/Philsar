const {
    S3Client,
    CreateMultipartUploadCommand,
    UploadPartCommand,
    CompleteMultipartUploadCommand,
    AbortMultipartUploadCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    ListObjectsV2Command
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Seminar recordings live in a private Cloudflare R2 bucket, reached through
// R2's S3-compatible API. Needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY and R2_BUCKET; R2_ENDPOINT (optional) points at another
// S3-compatible store instead, which is how it's tested locally.
const isRecordingStorageConfigured = () => !!(
    process.env.R2_BUCKET && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY &&
    (process.env.R2_ACCOUNT_ID || process.env.R2_ENDPOINT)
);

let client = null;
const getClient = () => {
    if (!client) {
        client = new S3Client({
            region: 'auto',
            endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
            forcePathStyle: !!process.env.R2_ENDPOINT,
            credentials: {
                accessKeyId: process.env.R2_ACCESS_KEY_ID,
                secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
            },
            // R2 doesn't accept every checksum header newer SDK versions add by default
            requestChecksumCalculation: 'WHEN_REQUIRED',
            responseChecksumValidation: 'WHEN_REQUIRED'
        });
    }
    return client;
};
const bucket = () => process.env.R2_BUCKET;

const startUpload = async (key, contentType) => {
    const result = await getClient().send(new CreateMultipartUploadCommand({ Bucket: bucket(), Key: key, ContentType: contentType }));
    return result.UploadId;
};

// R2 needs every part except the last to be the same size (the browser sends 8 MB parts)
const uploadPart = async (key, uploadId, partNumber, body) => {
    const result = await getClient().send(new UploadPartCommand({ Bucket: bucket(), Key: key, UploadId: uploadId, PartNumber: partNumber, Body: body }));
    return result.ETag;
};

const finishUpload = (key, uploadId, parts) => getClient().send(new CompleteMultipartUploadCommand({
    Bucket: bucket(), Key: key, UploadId: uploadId,
    MultipartUpload: { Parts: parts.map(({ PartNumber, ETag }) => ({ PartNumber, ETag })) }
}));

const abortUpload = (key, uploadId) => getClient().send(new AbortMultipartUploadCommand({ Bucket: bucket(), Key: key, UploadId: uploadId }));

const deleteObject = key => getClient().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));

// A private link to watch a recording, valid for a few hours
const watchUrl = (key, expiresInSeconds = 6 * 60 * 60) =>
    getSignedUrl(getClient(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: expiresInSeconds });

// Run once at server start, so a wrong setting shows in the logs instead of when
// a host first presses Record. The message never includes the keys.
const checkRecordingStorage = async () => {
    if (!isRecordingStorageConfigured()) {
        return "Recording storage isn't set up (R2_* variables missing), so hosts can't record.";
    }
    try {
        await getClient().send(new ListObjectsV2Command({ Bucket: bucket(), MaxKeys: 1 }));
        return `Recording storage ready (bucket "${bucket()}").`;
    } catch (error) {
        return `Recording storage NOT reachable (bucket "${bucket()}"): ${error.name || error.message}`;
    }
};

module.exports = { isRecordingStorageConfigured, startUpload, uploadPart, finishUpload, abortUpload, deleteObject, watchUrl, checkRecordingStorage };
