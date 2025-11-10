const AWS = require('aws-sdk');

const bedrock = new AWS.BedrockRuntime();
const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  const { question, partnerId } = JSON.parse(event.body);
  
  try {
    // Get documents from DynamoDB
    const docs = await dynamodb.scan({
      TableName: process.env.METADATA_TABLE,
      Limit: 2
    }).promise();
    
    // Get document content from S3
    let context = 'IFSF Documentation Context:\n';
    
    if (docs.Items.length > 0) {
      const doc = docs.Items[0];
      try {
        const object = await s3.getObject({
          Bucket: process.env.DOCUMENTS_BUCKET,
          Key: doc.s3Key
        }).promise();
        
        const content = object.Body.toString().substring(0, 2000);
        context += `Document: ${doc.documentId}\n${content}`;
      } catch (err) {
        context += 'Document content not accessible.';
      }
    } else {
      context += 'No documents found in system.';
    }
    
    if (!context) {
      context = 'No documents available for analysis.';
    }
    
    // Generate response using Bedrock
    const prompt = `You are an IFSF (International Forecourt Standards Forum) specification assistant. Based on the following document content, answer the user's question accurately and helpfully.

Document Content:
${context}

User Question: ${question}

Provide a helpful response about IFSF specifications, implementations, or related topics. If the question is not directly related to the documents, provide general IFSF knowledge.

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
        sources: docs.Items.map(doc => doc.fileName || doc.documentId),
        documentsFound: docs.Items.length,
        method: 'Direct S3 + Bedrock'
      })
    };
    
  } catch (error) {
    console.error('Error in direct chat:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Chat service unavailable' })
    };
  }
};