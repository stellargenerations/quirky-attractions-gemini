// .eleventy.js
module.exports = function(eleventyConfig) {

    // --- Passthrough Copy ---
    // Tell 11ty to copy these folders directly to the output directory (_site)
    eleventyConfig.addPassthroughCopy("css");
    eleventyConfig.addPassthroughCopy("js");
    // If you add an images folder later, add it here too:
    // eleventyConfig.addPassthroughCopy("img");
  
    // Optional: Add a console log to see if this part runs during build
    console.log("Passthrough copy for css and js configured.");
  
    // --- Return Config Object ---
    // You might have other configurations here
    return {
      // Define input and output directories (defaults are usually fine)
      dir: {
        input: ".",      // Root folder for inputs like index.html
        output: "_site", // Folder where the site is built
        // includes: "_includes", // Optional layout folder
        // data: "_data"       // Optional data folder
      },
      // Specify template formats (adjust if you use others)
      templateFormats: ["html", "md", "njk"],
      // Use Nunjucks templating engine for HTML files (optional)
      htmlTemplateEngine: "njk",
      markdownTemplateEngine: "njk"
    };
  };