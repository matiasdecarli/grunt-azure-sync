'use strict';

module.exports = function(grunt) {

   // Project configuration.
    grunt.initConfig({
        // Configuration to be run
        'azure-sync': {
            options : {
                cacheControl: 'public, max-age=31556926',
                force: false,
                container: 'container',
                storage: 'storage'
            },                   
            files: [{
                src: [                    
                    'README.md'                    
                ],
                dest: '/',
                expand: true,
                filter: 'isFile',
            }]
        }
    })

    // Actually load this plugin's task(s).
    grunt.loadTasks('tasks')

    // plugin's task(s), then test the result.
    grunt.registerTask('default', ['azure-sync'])

};