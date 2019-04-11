function onMergeCheck(id) {
  var row = document.getElementById("Row-" + id);
  var nextRow = row.nextElementSibling;

  // Set the draft text in the text input
  var draftText = getTextFromRow(row) + getTextFromRow(nextRow);
  row
    .getElementsByClassName("merge-text-input")[0]
    .getElementsByTagName("input")[0].value = draftText;

  // Hide and show things
  var editCell = row.getElementsByClassName("edit")[0];
  editCell.getElementsByClassName("merge-check")[0].style.display = "none";
  editCell.getElementsByClassName("merge-text-input")[0].style.display =
    "block";

  // Uncheck the checkbox
  row.querySelector("input[type=checkbox]").checked = false;
}

function getTextFromRow(row) {
  return row.firstElementChild.firstElementChild.innerText;
}

function confirmMerge(id) {
  var row = document.getElementById("Row-" + id);
  var nextRow = row.nextElementSibling;
  var nextId = nextRow.getAttribute("data-id");
  var text = row.querySelector("input[type=text]").value;

  // Update this row
  row.querySelector("div.text").innerText = text;
  row.querySelector("div.merged-note").style.display = "block";
  row.querySelector("div.merge-check").style.display = "block";
  row.querySelector("div.merge-text-input").style.display = "none";

  // Remove next row
  row.parentNode.removeChild(nextRow);

  // Remove any existing hidden inputs
  var form = document.getElementById("editSrcStringsForm");
  removeHiddenInput(form, id);
  removeHiddenInput(form, nextId);

  // Add hidden inputs
  form.insertAdjacentHTML("afterbegin", hiddenInputHtml(id, text));
  form.insertAdjacentHTML("afterbegin", hiddenInputHtml(nextId, ""));
}

function hiddenInputHtml(id, value) {
  return "<input type='hidden' name='" + id + "' value='" + value + "' />";
}

function removeHiddenInput(form, id) {
  var input = form.querySelector("input[name='" + id + "']");
  if (input) form.removeChild(input);
}
