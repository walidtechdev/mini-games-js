let random;
const dice = document.getElementById("dice");
const buttonRun = document.querySelector(".btn__roll");
const diceNumber = document.querySelectorAll(".dice__number");

//Dice roll with DOM
buttonRun.addEventListener("click", diceChooseDiv);

function diceChooseDiv() {
  //pour chaque element ajouter hidden a chaque roll avant d'en selectionner un autre
  diceNumber.forEach((number) => {
    number.classList.add("hidden");
  });
  random = diceNumber[Math.floor(Math.random() * diceNumber.length)];
  random.classList.remove("hidden");
}

//Dice roll with Math.random()

/* buttonRun.addEventListener("click", diceRolling);  */

//function rolling
/* function diceRolling(min, max) {
  random = Math.floor(Math.random() * 6) + 1;
  displayNumber();
} */

//function display
/* function displayNumber() {
  dice.textContent = random;
} */
