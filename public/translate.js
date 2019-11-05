function blurInput(id) {
  let input = document.querySelector("input[name='" + id + "']");
  updateIdenticalAndPostTranslations(id, input);
}

function blurTextarea(id) {
  let input = document.querySelector("textarea[name='" + id + "']");
  updateIdenticalAndPostTranslations(id, input);
}

function updateIdenticalAndPostTranslations(id, input) {
  let translation = input.value;
  if (translation.length == 0) return;
  postTranslation(id, translation);

  let baseCell = input.parentElement.parentElement;
  let src = srcFromCell(baseCell);

  document
    .querySelectorAll("input:enabled, textarea:enabled")
    .forEach(input => {
      const cell = input.closest("td");
      if (srcFromCell(cell) == src && input.value.length == 0) {
        input.value = translation;
        postTranslation(parseInt(input.name), translation);
      }
    });
}

function srcFromCell(cell) {
  return cell.firstChild.textContent.trim();
}

function postTranslation(id, targetText) {
  let req = new XMLHttpRequest();
  req.open("POST", apiUrl());
  req.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
  req.onreadystatechange = function() {
    if (req.readyState === 4 && req.status === 204) {
      document.getElementById("saved-" + id).style.display = "block";
    }
  };
  req.send(JSON.stringify([{ id: id, targetText: targetText }]));
}

function clearSaved(id) {
  document.getElementById("saved-" + id).style.display = "none";
}

function apiUrl() {
  return document
    .getElementById("translateLesson")
    .getAttribute("data-api-url");
}
