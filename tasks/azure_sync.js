/*
 * grunt-contrib-uglify
 * https://gruntjs.com/
 *
 * Copyright (c) 2013 Small Multiples
 * Licensed under the MIT license.
 */

'use strict';

// External libs.
var rimraf = require('rimraf')
    , async = require('async')
    , path = require('path')
    , zlib = require('zlib')
    , url = require('url')
    , crypto = require('crypto')
    , fs = require('fs')

module.exports = function(grunt) {
  grunt.registerMultiTask('azure-sync', 'A interface for uploading multiple files to Azure.', function() {
	var options = this.options()
      , tmp = path.resolve('.tmp')
      , done = this.async()
      , azure = require('azure')
      , blobService = azure.createBlobService()     
      , self = this;

    if (!options.username){
      var username = 'username';
    }
    else{
       var username = options.username;
    }

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
      grunt.log.success('>> [uploaded] ' + 'https://' + username + '.blob.core.windows.net' + dest)  
      blobService.createBlockBlobFromFile(options.container, dest.slice(1,dest.length)
        , src
        , function(error){
           if(error){ 
              console.log('error: ',error)
            }            
        });    
    }

    blobService.listBlobs(options.container, function(error, blobs){
        if(!error){          
          // Upload each file          
          var hashs = [];
          blobs.forEach(function(item){
              hashs[item.properties['content-md5']] = item.name;
          });          

          self.files.forEach(function(file) {  
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
                fs.readFile(absolute, function (err, data) {
                  if (err) throw err;                  
                  var hash = crypto.createHash('md5').update(data);
                  if(hashs[hash.digest('base64')] === undefined){
                      uploadFile(absolute, absolute, dest);
                  }
                  else{
                      grunt.log.ok('[exists] ' + 'https://' + username + '.blob.core.windows.net' + dest)
                  }                  
                });
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
                  fs.readFile(outputSrc, function (err, data) {
                    if (err) throw err;                  

                    var hash = crypto.createHash('md5').update(data);                    
                    if(hashs[hash.digest('base64')] === undefined){                                               
                        uploadFile(outputSrc, absolute, dest)
                    }
                    else{
                        grunt.log.ok('[exists] ' + 'https://' + username + '.blob.core.windows.net' + dest)
                    }       
                    if (itemsRem--==1){
                      done()
                    }
                    next()             
                  });                                            
                }) 
            }, function(err) {                
              if (err) throw err      
              rimraf(tmp, function(){});  
            })
          })
        }
    });
  })
}