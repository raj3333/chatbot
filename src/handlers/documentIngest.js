const AWS = require('aws-sdk');
const pdf = require('pdf-parse');

const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key);
    
    try {
      // Get document from S3
      const object = await s3.getObject({ Bucket: bucket, Key: key }).promise();
      
      // Extract text from PDF
      const pdfData = await pdf(object.Body);
      const text = pdfData.text;
      
      // Chunk text for indexing
      const chunks = chunkText(text, 1000);
      
      // Store metadata
      const documentId = key.split('/').pop().split('.')[0];
      await dynamodb.put({
        TableName: process.env.METADATA_TABLE,
        Item: {
          documentId,
          s3Key: key,
          uploadedAt: new Date().toISOString(),
          textLength: text.length,
          chunkCount: chunks.length,
          status: 'processed'
        }
      }).promise();
      
      console.log(`Processed document: ${documentId}`);
    } catch (error) {
      console.error('Error processing document:', error);
    }
  }
};

function chunkText(text, maxLength) {
  const chunks = [];
  for (let i = 0; i < text.length; i += maxLength) {
    chunks.push(text.substring(i, i + maxLength));
  }
  return chunks;
}