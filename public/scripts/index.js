const loginBtns = document.querySelectorAll('.login');
const signupBtns = document.querySelectorAll('.signup');


loginBtns.forEach(btn => {
  btn.addEventListener('click', ()=> {
    window.location.href = 'login.html'
  })
})


signupBtns.forEach(btn => {
  btn.addEventListener('click', ()=> {
    window.location.href = 'signup.html'
  })
})