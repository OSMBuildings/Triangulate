
module.exports = function(grunt) {

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    jshint: {
      options: {
        globals: {}
      },
      all: [
        'src/vec2.js',
        'src/vec3.js',
        'src/split.js',
        'src/Triangulate.js'
      ]
    },

    concat: {
      default: {
        options: {
          separator: '\n',
          banner: "(function(global) {",
          footer: "if (typeof global.define === 'function') {"+
          "global.define([], <%=pkg.name%>);"+
          "} else if (typeof global.exports === 'object') {"+
          "global.exports = <%=pkg.name%>;"+
          "} else {"+
          "global.<%=pkg.name%> = <%=pkg.name%>;"+
          "}\n"+
          "}(this));"
        },
        src: [
          'node_modules/Color/src/Color.js',
          'lib/earcut.custom.js',
          'src/vec2.js',
          'src/vec3.js',
          'src/split.js',
          'src/Triangulate.js'
        ],
        dest: 'dist/<%=pkg.name%>.js'
      }
    }
  });

  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-jshint');

  grunt.registerTask('default', 'Development build', function() {
    grunt.log.writeln('\033[1;36m'+ grunt.template.date(new Date(), 'yyyy-mm-dd HH:MM:ss') +'\033[0m');
    grunt.task.run('concat');
  });

  grunt.registerTask('release', 'Release', function() {
    grunt.log.writeln('\033[1;36m'+ grunt.template.date(new Date(), 'yyyy-mm-dd HH:MM:ss') +'\033[0m');
    grunt.task.run('jshint');
    grunt.task.run('default');
  });
};
