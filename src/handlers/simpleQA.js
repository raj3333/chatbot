const AWS = require('aws-sdk');

const bedrock = new AWS.BedrockRuntime();
const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  const { question, partnerId } = JSON.parse(event.body);
  
  try {
    // Get documents for partner
    const docs = await dynamodb.query({
      TableName: process.env.METADATA_TABLE,
      IndexName: 'partner-index',
      KeyConditionExpression: 'partnerId = :partnerId',
      ExpressionAttributeValues: { ':partnerId': partnerId }
    }).promise();
    
    // Get first document content as context
    let context = 'No documents found for this partner.';
    if (docs.Items.length > 0) {
      try {
        const doc = await s3.getObject({
          Bucket: process.env.DOCUMENTS_BUCKET,
          Key: docs.Items[0].s3Key
        }).promise();
        context = doc.Body.toString().substring(0, 2000); // First 2000 chars
      } catch (err) {
        context = 'Document content not accessible.';
      }
    }
    
    // Generate response using Bedrock
    const prompt = `Based on this IFSF document context, answer the question:

Context: ${context}

Question: ${question}

Answer:`;
    
    const response = await bedrock.invokeModel({
      modelId: process.env.BEDROCK_MODEL_ID,
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }]
      })
    }).promise();
    
    const result = JSON.parse(response.body.toString());
    
    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        answer: result.content[0].text,
        documentsFound: docs.Items.length
      })
    };
  } catch (error) {
    console.error('Q&A error:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Q&A service unavailable' })
    };
  }
};