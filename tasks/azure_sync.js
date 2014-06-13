/*
 * grunt-contrib-uglify
 * https://gruntjs.com/
 *
 * Copyright (c) 2013 Small Multiples
 * Licensed under the MIT license.
 */

'use strict';

// External libs.
var async = require('async'), 
	zlib = require('zlib'), 
	crypto = require('crypto'), 
	fs = require('fs'), 
	azure = require('azure'),
	mime = require('mime'),
	tmp = require('tmp');

module.exports = function(grunt) {
	grunt.registerMultiTask('azure-sync', 'A interface for uploading multiple files to Azure.', function() {	  	
		var done = this.async();
		var self = this;
		var options = this.options();

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
			function(hashList, allDone) {
				async.each(self.filesSrc, function(file, next) {
					async.waterfall([
						// get the right file name
						function(nextFile) {
							if(!self.options().gzip)
								return nextFile(null, null);

							generateGzipVersion(file, nextFile);
						},
						// check file exists
						function(gzipFilePath, nextFile) {
							var removePath = self.options().removeFirstPath;
							exists(removePath, hashList, file, gzipFilePath, nextFile);
						},
						// upload file when it doesn't exist
						function(gzipFile, fileExists, nextFile) {
							if(fileExists) return nextFile(null, false);

							var path = gzipFile || file;
							var gzip = self.options().gzip;
							var cacheControl = self.options().cacheControl;		
							var removePath = self.options().removeFirstPath;
					
							uploadFile(removePath, file, path, gzip, cacheControl, nextFile);
						}, 
						function(uploaded, nextFile) {
							var blobUrl = 'https://' + process.env.AZURE_STORAGE_ACCOUNT + '.blob.core.windows.net/' + process.env.AZURE_STORAGE_CONTAINER + file.substring(file.indexOf("/"),file.length);

							if(uploaded) {
								grunt.log.ok('[uploaded] ' + blobUrl); 
							} else {
								grunt.log.write('[skipped] ' + blobUrl + '\n');
							}

							nextFile();
						}
					], next);
				}, allDone);
			}
		], done);
	});

	function generateGzipVersion(file, callback) {
		tmp.file(function(err, path) {
			if(err) return callback(err);

			var gzip = zlib.createGzip({ level: 9 });
		 	var compressed = fs.createReadStream(file).pipe(gzip);
		 	
		 	compressed.pipe(fs.createWriteStream(path)).on('close', function(err) {
		 		callback(err, path);
		 	});
		});
	}

	function exists(removePath, files, file, gzipPath, callback) { 
		if (removePath){
			file = file.substring(file.indexOf("/")+1,file.length);
		}
		if(!files[file]) return callback(null, gzipPath, false);

		callback(null, gzipPath, true);
	}

	function getContent(file, gzip, callback) {
		var content = grunt.file.read(file);

		if(!gzip) return callback(null, content);

		zlib.gzip(content, callback);		
	}

	function processMd5(blobs,callback) {
		var hashs = {};	
	    
	    blobs.forEach(function(item) {
	        hashs[item.name] = item.properties['content-md5'];
	    });        

	    return callback(null,hashs);
	}

	function ensureContainer(containerName, callback) {	
	    return azure.createBlobService().createContainerIfNotExists(containerName, {publicAccessLevel : 'blob'}, callback);	    
	}

	function listBlobsFromContainer(containerName, callback) {		
	    return azure.createBlobService().listBlobs(containerName, callback);        
	}

	function uploadFile(removePath, name, path, gzip, cacheControl, callback) {
		var params = { setBlobContentMD5: true, cacheControlHeader: cacheControl, contentType: mime.lookup(name) };

		if(gzip) {
			grunt.util._.extend(params, { contentEncodingHeader: 'gzip' });			
		}

		if (removePath){
			name = name.substring(name.indexOf("/")+1,name.length);
		}

		var container = process.env.AZURE_STORAGE_CONTAINER;
		var service = azure.createBlobService(); 	

		service.createBlockBlobFromFile(container, name, path, params, function(err) {
			callback(null, true);
		});   	
	}
}