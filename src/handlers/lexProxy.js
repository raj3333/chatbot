exports.handler = async (event) => {
  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ message: 'Lex proxy not implemented yet' })
  };
};