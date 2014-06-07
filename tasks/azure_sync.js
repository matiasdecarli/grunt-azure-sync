/*
 * grunt-contrib-uglify
 * https://gruntjs.com/
 *
 * Copyright (c) 2013 Small Multiples
 * Licensed under the MIT license.
 */

'use strict';

// External libs.
var , rimraf = require('rimraf')
    , async = require('async')
    , path = require('path')
    , zlib = require('zlib')
    , url = require('url')
    , fs = require('fs')

module.exports = function(grunt) {
  grunt.registerMultiTask('azure-sync', 'A streaming interface for uploading multiple files to Azure.', function() {
	var options = this.options()
      , tmp = path.resolve('.tmp')
      , done = this.async()
      , azure = require('azure')
      , blobService = azure.createBlobService()     

    options.headers = options.headers || {}
    if (options.gzip) {
      options.headers['Content-Encoding'] = 'gzip'
    }

    var actualFiles = this.files.map(function(set) {
      return set.src.filter(function(file) {
        return grunt.file.isFile(file)
      })
    }).reduce(function(a, b) {
      return a.concat(b)
    }, [])

    // Handle the upload for each files
    var uploadFile = function(src, orig, dest) { 
      grunt.log.success('>> [uploaded] ' + dest) 
      blobService.createBlockBlobFromFile(options.container, dest.slice(1,dest.length)
        , src
        , function(error){
           if(error){ 
              console.log('error: ',error)
            }            
        });    
    }

    // Upload each file
    this.files.forEach(function(file) {  
      var list = file.src.filter(function(file) {
        return actualFiles.indexOf(file) !== -1
      })

      var itemsRem = list.length;

      async.mapLimit(list, 25, function(src, next) {        
        var absolute = path.resolve(src)
        var dest = url.resolve(file.dest, path.relative(file.root, src))
        var useGzip = 'gzip' in file ? !!file.gzip : !!options.gzip
        var gzipCompLevel = 'compressionLevel' in file
          ? file.compressionLevel
          : options.compressionLevel

        if (!useGzip) {
          uploadFile(absolute, absolute, dest)
          return next()
        }

        // GZip the file
        var outputSrc = path.resolve(tmp, src)

        grunt.file.mkdir(path.dirname(outputSrc))

        if(typeof gzipCompLevel === 'undefined') {
          gzipCompLevel = 9
        }

        var gzip = zlib.createGzip({ level: gzipCompLevel })
          , input = fs.createReadStream(absolute)
          , output = fs.createWriteStream(outputSrc)

        input
          .pipe(gzip)
          .pipe(output)
          .once('close', function() {
            uploadFile(outputSrc, absolute, dest)
            if (itemsRem--==1){
              done()
            }
            next()          
          }) 
      }, function(err) {                
        if (err) throw err      
        rimraf(tmp, function(){});  
      })
    })
  })
}