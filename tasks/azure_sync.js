/*
 * grunt-azure-sync
 * https://gruntjs.com/
 *
 * Copyright (c) 2014 Matias De Carli
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

		var container = (options.container)? options.container : process.env.AZURE_STORAGE_CONTAINER;
		var storage = (options.storage)? options.storage : process.env.AZURE_STORAGE_ACCOUNT;

		async.waterfall([
			//create container if not exists
			function(callback) {					
				ensureContainer(container, callback);								
			},
			//retrieve all blobs
			function(result,response,callback) {		
				if (result) 
					console.log('Container: ' + container +' was created');
				
				listBlobsFromContainer(container, callback);
			},
			//process md5
			function(blobs,result,response,callback) {						
				buildHashTable(blobs, callback);
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
							if(options.force) return nextFile(null, gzipFilePath, false);

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
					
							uploadFile(container, removePath, file, path, gzip, cacheControl, nextFile);
						}, 
						function(uploaded, nextFile) {
							var blobUrl = 'https://' + storage + '.blob.core.windows.net/' + container + file.substring(file.indexOf("/"),file.length);

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

	function ensureContainer(containerName, callback) {	
	    return azure.createBlobService().createContainerIfNotExists(containerName, {publicAccessLevel : 'blob'}, callback);	    
	}

	function listBlobsFromContainer(containerName, callback) {		
	    return azure.createBlobService().listBlobs(containerName, callback);        
	}

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

	function buildHashTable(blobs,callback) {
		var hashs = {};	
	    
	    blobs.forEach(function(item) {
	        hashs[item.name] = item.properties['content-md5'];
	    });        

	    return callback(null,hashs);
	}

	function exists(removePath, files, file, gzipPath, callback) { 
		if (removePath) {
			var orgiginalPath = file;
			file = file.substring(file.indexOf("/")+1,file.length);
		}

		if(!files[file]) return callback(null, gzipPath, false);

		fs.readFile(gzipPath || orgiginalPath, function(err, data) {			
			if(err) return callback(err);

			var hash = crypto.createHash('md5').update(data);
			callback(null, gzipPath, files[file] == hash.digest('base64'));
		});	
	}

	function uploadFile(container, removePath, name, path, gzip, cacheControl, callback) {
		var params = { setBlobContentMD5: true, cacheControlHeader: cacheControl, contentType: mime.lookup(name) };
		if(gzip) {
			grunt.util._.extend(params, { contentEncodingHeader: 'gzip' });			
		}		

		if (removePath){
			name = name.substring(name.indexOf("/")+1,name.length);
		}

		var service = azure.createBlobService(); 	

		service.createBlockBlobFromFile(container, name, path, params, function(err) {
			callback(null, true);
		});   	
	}
}