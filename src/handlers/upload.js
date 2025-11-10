const AWS = require('aws-sdk');

const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'OPTIONS,POST'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    // Parse multipart form data (simplified for base64 uploads)
    const body = JSON.parse(event.body);
    const { fileName, partnerId, documentType, fileData } = body;
    
    // Decode base64 file data
    const buffer = Buffer.from(fileData, 'base64');
    const key = `uploads/${partnerId}/${Date.now()}-${fileName}`;
    
    // Upload to S3
    await s3.putObject({
      Bucket: process.env.DOCUMENTS_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: 'application/pdf'
    }).promise();
    
    // Store metadata
    const documentId = key.split('/').pop().split('.')[0];
    await dynamodb.put({
      TableName: process.env.METADATA_TABLE,
      Item: {
        documentId,
        partnerId,
        documentType,
        s3Key: key,
        fileName,
        uploadedAt: new Date().toISOString(),
        status: 'uploaded'
      }
    }).promise();
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
      body: JSON.stringify({
        success: true,
        documentId,
        message: 'Document uploaded successfully'
      })
    };
    
  } catch (error) {
    console.error('Upload error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Upload failed' })
    };
  }
};