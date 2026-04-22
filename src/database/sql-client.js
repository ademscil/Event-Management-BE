const config = require('../config');

const sql = config.database?.dialect === 'localdb'
  ? require('mssql/msnodesqlv8')
  : require('mssql');

module.exports = sql;
