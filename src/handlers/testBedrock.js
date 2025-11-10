const AWS = require('aws-sdk');

const bedrock = new AWS.BedrockRuntime();

exports.handler = async (event) => {
  try {
    console.log('Testing Bedrock with model:', process.env.BEDROCK_MODEL_ID);
    
    const response = await bedrock.invokeModel({
      modelId: process.env.BEDROCK_MODEL_ID,
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 100,
        messages: [{ role: "user", content: "Hello, can you summarize this: BugBot is an AI tool for support." }]
      })
    }).promise();
    
    const result = JSON.parse(response.body.toString());
    
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        success: true,
        model: process.env.BEDROCK_MODEL_ID,
        response: result.content[0].text
      })
    };
    
  } catch (error) {
    console.error('Bedrock test error:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        error: error.message,
        code: error.code,
        model: process.env.BEDROCK_MODEL_ID
      })
    };
  }
};