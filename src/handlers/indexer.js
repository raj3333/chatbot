const AWS = require('aws-sdk');

const kendra = new AWS.Kendra({ region: process.env.KENDRA_REGION || 'us-east-1' });
const s3 = new AWS.S3();

exports.handler = async (event) => {
  for (const record of event.Records) {
    if (record.eventName === 'INSERT') {
      const document = record.dynamodb.NewImage;
      
      try {
        // Get document content
        const object = await s3.getObject({
          Bucket: process.env.DOCUMENTS_BUCKET,
          Key: document.s3Key.S
        }).promise();
        
        // Index in Kendra (simplified without custom attributes)
        await kendra.batchPutDocument({
          IndexId: process.env.KENDRA_INDEX_ID,
          Documents: [{
            Id: document.documentId.S,
            Title: document.fileName?.S || document.documentId.S,
            Blob: object.Body,
            ContentType: 'application/pdf'
          }]
        }).promise();
        
        console.log(`Indexed document: ${document.documentId.S}`);
      } catch (error) {
        console.error('Error indexing document:', error);
      }
    }
  }
};