'use strict';

module.exports = function(grunt) {

   // Project configuration.
    grunt.initConfig({
        // Configuration to be run
        'azure-sync': {
            options : {
                container: 'CONTAINER',
                username: 'matiasdecarli',           
            }
            , stage: {
                options: {},
                files: [
                    {
                        src:  'tasks/**/*.js'
                      , dest: 'js/'
                      , gzip: true
                    },
                    {
                        src:  'Gruntfile.js'
                      , dest: 'Gruntfile.js'
                    },
                    {
                        src 'foo/**/*.css'
                        dest: 'css/'
                        gzip: true
                        compressionLevel: 9
                    },
                    {
                        src:  'foo/bar'
                      , dest: 'none'
                    }
                ]
            }
        }
    })

    // Actually load this plugin's task(s).
    grunt.loadTasks('tasks')

    // plugin's task(s), then test the result.
    grunt.registerTask('default', ['azure-sync:stage'])

};