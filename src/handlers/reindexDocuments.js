const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const kendra = new AWS.Kendra({ region: process.env.KENDRA_REGION || 'us-east-1' });
const s3 = new AWS.S3();

exports.handler = async (event) => {
  try {
    // Get all documents from DynamoDB
    const result = await dynamodb.scan({
      TableName: process.env.METADATA_TABLE
    }).promise();
    
    console.log(`Found ${result.Items.length} documents to reindex`);
    
    for (const doc of result.Items) {
      try {
        // Get document content from S3
        const object = await s3.getObject({
          Bucket: process.env.DOCUMENTS_BUCKET,
          Key: doc.s3Key
        }).promise();
        
        // Index in Kendra
        await kendra.batchPutDocument({
          IndexId: process.env.KENDRA_INDEX_ID,
          Documents: [{
            Id: doc.documentId,
            Title: doc.fileName || doc.documentId,
            Blob: object.Body,
            ContentType: 'application/pdf',
            Attributes: {
              'partnerId': {
                StringValue: doc.partnerId || 'unknown'
              },
              'documentType': {
                StringValue: doc.documentType || 'unknown'
              }
            }
          }]
        }).promise();
        
        console.log(`Reindexed document: ${doc.documentId}`);
        
      } catch (error) {
        console.error(`Error reindexing document ${doc.documentId}:`, error);
      }
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Reindexed ${result.Items.length} documents`,
        success: true
      })
    };
    
  } catch (error) {
    console.error('Error in reindexing:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Reindexing failed' })
    };
  }
};