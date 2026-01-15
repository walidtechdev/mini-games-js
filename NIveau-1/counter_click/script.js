let count = 0; //manage the numbers
const buttonCount = document.querySelector(".btn__count");
const buttonReset = document.querySelector(".btn__reset");
const numberDisplay = document.querySelector(".count");

//click event
buttonCount.addEventListener("click", addNumber);

//function add +1
function addNumber() {
  count++;
  displayCount();
}

//reset event
buttonReset.addEventListener("click", resetNumber);

//function reset
function resetNumber() {
  count = 0;
  displayCount();
}

//function display
function displayCount() {
  numberDisplay.textContent = count;
}
