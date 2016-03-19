/*jshint maxstatements: false */

module.exports = function(grunt) {
  "use strict";

  // Load necessary tasks
  grunt.loadNpmTasks("grunt-contrib-jshint");

  // Project configuration.
  var config = {
    // Task configuration
    jshint: {
      options: {
        jshintrc: true
      },
      gruntfile: ["Gruntfile.js"],
      src: ["!Gruntfile.js", "*.js"]
    }
  };
  grunt.initConfig(config);


  // Default task
  grunt.registerTask("default", ["jshint"]);

  // Test task
  grunt.registerTask("test", ["jshint"]);

};
