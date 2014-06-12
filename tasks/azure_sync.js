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
	, mime = require('mime')
	, azure = require('azure')

module.exports = function(grunt) {
	grunt.registerMultiTask('azure-sync', 'A interface for uploading multiple files to Azure.', function() {	  	
		var done = this.async();
		var self = this;
		var options = this.options();
        var tmp = path.resolve('.tmp')

		async.waterfall([
			//create container if not exists
			function(callback) {					
				ensureContainer(process.env.AZURE_STORAGE_CONTAINER, callback);								
			},
			//retrieve all blobs
			function(result,response,callback) {		
				if (result) 
					console.log('Container: ' + process.env.AZURE_STORAGE_CONTAINER +' was created');
				
				listBlobsFromContainer(process.env.AZURE_STORAGE_CONTAINER, callback);
			},
			//process md5
			function(blobs,result,response,callback) {						
				processMd5(blobs, callback);
			},
			//compare and upload files
			function(hashList, callback) {	

				var actualFiles = self.files.map(function(set) {
			      return set.src.filter(function(file) {
			        return grunt.file.isFile(file)
			      })
			    }).reduce(function(a, b) {
			      return a.concat(b)
			    }, []);

				self.files.forEach(function(file) { 
		            
		            var list = file.src.filter(function(file) {
		              return actualFiles.indexOf(file) !== -1
		            })
      			
					async.eachLimit(list, 25, function(src,next){
						
						var absolute = path.resolve(src);
						var dest = url.resolve(file.dest, path.relative(file.root, src))

						if (options.gzip){						
							 var outputSrc = path.resolve(tmp, src)

				             grunt.file.mkdir(path.dirname(outputSrc))

				             var gzipCompLevel = 'compressionLevel' in file
				                ? file.compressionLevel
				                : options.compressionLevel

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
									var target = outputSrc;

									fs.readFile(target, function (err, data) {
				           		   		var hash = crypto.createHash('md5').update(data);
					                    var exists = hashList[hash.digest('base64')];
					                    if((exists === undefined) || (exists != dest.slice(1,dest.length))){
					                       uploadFile(options.gzip, absolute, dest, target, options.cachecontrol, callback);
					                    }
					                    else{
					                       console.log('[exists] ' + 'https://' + process.env.AZURE_STORAGE_ACCOUNT + '.blob.core.windows.net/' + process.env.AZURE_STORAGE_CONTAINER + dest)
					                    }                  
					                    next;	
				           		    });  
								});
						}	
						else{									
							var target = absolute;			

							fs.readFile(absolute, function (err, data) {
		           		   		var hash = crypto.createHash('md5').update(data);
			                    var exists = hashList[hash.digest('base64')];
			                    if((exists === undefined) || (exists != dest.slice(1,dest.length))){
			                       uploadFile(options.gzip, absolute, dest, src, options.cachecontrol, callback);
			                    }
			                    else{
			                       console.log('[exists] ' + 'https://' + process.env.AZURE_STORAGE_ACCOUNT + '.blob.core.windows.net/' + process.env.AZURE_STORAGE_CONTAINER + dest)
			                    }                  
			                    next;	
		           		    });  
					}

					});		
				},callback);
			},
		], done);
	});
}

// function getContentForUpload(path, gzip, callback) { process.env.AZURE_STORAGE_CONTAINER
// 	if(gzip) {
// 		return camino del gzip
// 	}

// 	// retun el camino del no gzip
// }

function actualFiles(){

}

function processMd5(blobs,callback){
	var hashs = [];	
    blobs.forEach(function(item){
        hashs[item.properties['content-md5']] = item.name;
    });        
    return callback(null,hashs);
}

function ensureContainer(containerName, callback) {	
    return azure.createBlobService().createContainerIfNotExists(containerName, {publicAccessLevel : 'blob'}, callback);	    
}

function listBlobsFromContainer(containerName, callback) {		
    return azure.createBlobService().listBlobs(containerName, callback);        
}

function uploadFile(gzip, fileName, dest, src ,cacheControl, callback) {
	var params = {
        setBlobContentMD5: true,
        cacheControlHeader: cacheControl
 	}

  	if (gzip) {
    	var mim = 'gzip';     	
    	params.contentEncodingHeader=mim  
  	}
  	else{
    	var mim = mime.lookup(src);
    	params.contentEncodingHeader=mim        
  	}

	azure.createBlobService().createBlockBlobFromFile(
	      process.env.AZURE_STORAGE_CONTAINER
	    , dest.slice(1,dest.length)
	    , src
	    , params
	    , function(error){
	       if(error){ 
	          console.log('error: ',error)
	        }
	        else{
	          console.log('>> [uploaded][' + mim + '] ' + 'https://' + process.env.AZURE_STORAGE_ACCOUNT + '.blob.core.windows.net/' + process.env.AZURE_STORAGE_CONTAINER + dest)  
	        }                  
	    }); 

	return callback;   	
}