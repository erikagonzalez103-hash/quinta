/* ============================================================
   Quinta & Co. — blog landing-page renderer
   Builds the list of posts from posts.js. You won't need to
   edit this file — edit posts.js to add or change posts.
   ============================================================ */

(function () {
  "use strict";

  function formatDate(d) {
    var parts = (d || "").split("-");
    if (parts.length !== 3) return d || "";
    var months = ["January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"];
    return months[parseInt(parts[1], 10) - 1] + " " + parseInt(parts[2], 10) + ", " + parts[0];
  }

  function render() {
    var list = document.getElementById("post-list");
    if (!list || typeof QUINTA_POSTS === "undefined") return;

    var posts = QUINTA_POSTS.slice().sort(function (a, b) {
      return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0);
    });

    if (posts.length === 0) {
      var empty = document.createElement("p");
      empty.className = "pc-excerpt";
      empty.textContent = "New writing is on the way.";
      list.appendChild(empty);
      return;
    }

    posts.forEach(function (p) {
      var card = document.createElement("a");
      card.className = "post-card";
      card.href = p.slug + ".html";

      if (p.image) {
        var thumb = document.createElement("span");
        thumb.className = "pc-thumb";
        var im = document.createElement("img");
        im.src = "../images/" + p.image;
        im.alt = "";
        im.loading = "lazy";
        thumb.appendChild(im);
        card.appendChild(thumb);
      }

      var text = document.createElement("span");
      text.className = "pc-text";

      var meta = document.createElement("p");
      meta.className = "pc-meta";
      meta.textContent = formatDate(p.date) + " · " + p.author;

      var title = document.createElement("p");
      title.className = "pc-title";
      title.textContent = p.title;

      var excerpt = document.createElement("p");
      excerpt.className = "pc-excerpt";
      excerpt.textContent = p.excerpt || "";

      text.appendChild(meta);
      text.appendChild(title);
      text.appendChild(excerpt);
      card.appendChild(text);
      list.appendChild(card);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
