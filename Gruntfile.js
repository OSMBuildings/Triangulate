
module.exports = function(grunt) {

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    jshint: {
      options: {
        globals: {}
      },
      all: 'src/index.js'
    },

    concat: {
      default: {
        options: {
          separator: "\n",
          banner: "\n(function(global) {",
          footer: "if (typeof global.define === 'function') {\n"+
            "global.define([], Triangulate);\n"+
          "} else if (typeof global.exports === 'object') {\n"+
            "global.module.exports = Triangulate;\n"+
          "} else {\n"+
            "global.Triangulate = Triangulate;\n"+
          "}\n"+
          "}(this));\n"
        },
        src: [
          //"node_modules/earcut/dist/earcut.dev.js",
          "src/earcut.dev.js",
          "node_modules/Color/dist/Color.debug.js",
          "src/index.js"
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
