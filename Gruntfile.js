
module.exports = function(grunt) {

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    jshint: {
      options: {
        globals: {}
      },
      all: [
        'src/GeoJSON.js',
        'src/triangulate.js',
        'src/vector.js'
      ]
    },

    concat: {
      default: {
        options: {
          separator: '\n',
          banner: "(function(global) {",
          footer: "if (typeof global.define === 'function') {"+
          "global.define([], GeoJSON);"+
          "} else if (typeof global.exports === 'object') {"+
          "global.module.exports = GeoJSON;"+
          "} else {"+
          "global.GeoJSON = GeoJSON;"+
          "}\n"+
          "}(this));"
        },
        src: [
          'node_modules/Color/dist/Color.debug.js',
          'node_modules/earcut/src/earcut.js',
          'src/GeoJSON.js',
          'src/triangulate.js',
          'src/vector.js'
        ],
        dest: 'dist/<%=pkg.name%>.debug.js'
      }
    },

    uglify: {
      default: {
        options: {},
        src: 'dist/<%=pkg.name%>.debug.js',
        dest: 'dist/<%=pkg.name%>.js'
      }
    }
  });

  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-uglify');

  grunt.registerTask('default', 'Development build', function() {
    grunt.log.writeln('\033[1;36m'+ grunt.template.date(new Date(), 'yyyy-mm-dd HH:MM:ss') +'\033[0m');
    grunt.task.run('concat');
    grunt.task.run('uglify');
  });

  grunt.registerTask('release', 'Release', function() {
    grunt.log.writeln('\033[1;36m'+ grunt.template.date(new Date(), 'yyyy-mm-dd HH:MM:ss') +'\033[0m');
    grunt.task.run('jshint');
    grunt.task.run('default');
  });
};
