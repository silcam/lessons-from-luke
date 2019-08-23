function blurInput(id) {
  let input = document.querySelector("input[name='" + id + "']");
  postTranslation(id, input.value);
}

function blurTextarea(id) {
  let input = document.querySelector("textarea[name='" + id + "']");
  postTranslation(id, input.value);
}

function postTranslation(id, targetText) {
  if (targetText.length == 0) {
    return;
  }
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
