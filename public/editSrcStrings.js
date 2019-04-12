/*
    Merge Next Button
*/
function mergeNext(id) {
  var row = document.getElementById("Row-" + id);
  var nextRow = row.nextElementSibling;

  // Show the draft text
  var draftTextHtml =
    "<span>" +
    getTextFromRow(row) +
    "</span><span class='added'>" +
    getTextFromRow(nextRow) +
    "</span>";
  row.querySelector("div.text").innerHTML = draftTextHtml;

  // Hide and show things
  nextRow.style.display = "none";
  row.querySelector("div.base-buttons").style.display = "none";
  row.querySelector("div.merge-in-progress").style.display = "block";
}

function getTextFromRow(row) {
  return row.firstElementChild.firstElementChild.innerText;
}

/*
  Cancel Merge Button
*/
function cancelMerge(id) {
  var row = document.getElementById("Row-" + id);
  var nextRow = row.nextElementSibling;
  var originalText = row.querySelector("div.text span").innerText.trim();
  row.querySelector("div.text").innerText = originalText;

  nextRow.style.display = ""; // Default for tr
  row.querySelector("div.base-buttons").style.display = "block";
  row.querySelector("div.merge-in-progress").style.display = "none";
}

/*
  Add Space Button
*/
function addMergeSpace(id) {
  var row = document.getElementById("Row-" + id);
  row.querySelector("div.text span").innerText += " ";
}

/*
  Confirm Merge Button
*/
function confirmMerge(id) {
  var row = document.getElementById("Row-" + id);
  var nextRow = row.nextElementSibling;
  var nextId = nextRow.getAttribute("data-id");
  var text = row.querySelector("div.text").innerText;

  // Update this row
  row.querySelector("div.text").innerText = text; // Remove the spans
  row.querySelector("div.base-buttons").style.display = "block";
  row.querySelector("div.merge-in-progress").style.display = "none";
  row.querySelector("div.merged-note").style.display = "block";

  // Remove next row
  row.parentNode.removeChild(nextRow);

  // Add hidden inputs
  setHiddenInput(id, text);
  setHiddenInput(nextId, "");
}

/*
  Edit Button
*/
function edit(id) {
  var row = document.getElementById("Row-" + id);
  var text = row.querySelector("div.text").innerText;
  row.querySelector("input[type=text]").value = text;

  row.querySelector("div.text").style.display = "none";
  row.querySelector("div.text-input").style.display = "block";
  row.querySelector("div.base-buttons").style.display = "none";
  row.querySelector("div.edit-in-progress").style.display = "block";
}

/*
  Save Edit Button
*/
function saveEdit(id) {
  var row = document.getElementById("Row-" + id);
  var text = row.querySelector("input[type=text]").value;
  var oldText = row.querySelector("div.text").innerText.trim();

  if (text != oldText) {
    row.querySelector("div.text").innerText = text;
    row.querySelector("div.edited-note").style.display = "block";
    setHiddenInput(id, text);
  }

  row.querySelector("div.text").style.display = "block";
  row.querySelector("div.text-input").style.display = "none";
  row.querySelector("div.base-buttons").style.display = "block";
  row.querySelector("div.edit-in-progress").style.display = "none";
}

/*
  Delete Button
*/
function deleteItem(id) {
  var row = document.getElementById("Row-" + id);

  row.querySelector("div.text").style.textDecoration = "line-through";
  row.querySelector("div.base-buttons").style.display = "none";
  row.querySelector("div.delete-in-progress").style.display = "block";
}

/*
  Cancel Delete
*/
function cancelDelete(id) {
  var row = document.getElementById("Row-" + id);

  row.querySelector("div.text").style.textDecoration = "initial";
  row.querySelector("div.base-buttons").style.display = "block";
  row.querySelector("div.delete-in-progress").style.display = "none";
}

/*
  Confirm Delete Button
*/
function confirmDelete(id) {
  var row = document.getElementById("Row-" + id);
  row.parentElement.removeChild(row);
  setHiddenInput(id, "");
}

function setHiddenInput(id, value) {
  var form = document.getElementById("editSrcStringsForm");

  // Remove existing
  var input = form.querySelector("input[name='" + id + "']");
  if (input) form.removeChild(input);

  // Add input
  form.insertAdjacentHTML("afterbegin", hiddenInputHtml(id, value));
}

function hiddenInputHtml(id, value) {
  return "<input type='hidden' name='" + id + "' value='" + value + "' />";
}
