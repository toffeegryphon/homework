let provider = null
let db = null

let authUser = null
let userData = {
  classes: null,
  homework: {},
  homeworkIds: []
}

let prevFetch = fetchToday

function blink(element, className, also = null) {
  document.querySelector(element).classList.add(className)
  setTimeout(() => {
    document.querySelector(element).classList.remove(className)
    if (also !== null) also()
  }, 1000)
}

function login() {
  firebase.auth().signInWithPopup(provider).then(function(result) {
    // This gives you a Google Access Token. You can use it to access the Google API.
    var token = result.credential.accessToken;
    // The signed-in user info.
    authUser = result.user;
    // ...
  }).catch(function(error) {
    // Handle Errors here.
    console.log(error)
  })
}

function logout() {
  firebase.auth().signOut().then(function() {
    // Sign-out successful.
  }).catch(function(error) {
    console.log(error)
  });
}

function toggleUpdateClasses() {
  divClasses = document.querySelector('#update-classes-div').classList
  if (divClasses.contains('hidden')) {
    divClasses.remove('hidden')
  } else {
    divClasses.add('hidden')
  }
  
}

function retrieveClasses(update = false) {
  if (update || userData.classes === null) {
    db.collection('users').doc(authUser.uid).get().then((doc) => {
      userData.classes = doc.data().classes
      document.querySelector('#existing-classes').textContent = userData.classes
    }).catch(error => {
      console.error(error)
    })
  }
  return userData.classes
}

function updateClasses() {
  // TODO Need to limit to max 10 due to subcollection limitations
  const rawClasses = document.querySelector('#classes').value
  const classes = rawClasses.replace(/\s+/g, '').toUpperCase().split(',')
  db.collection('users').doc(authUser.uid).set(
    { classes }, { merge: true }
  ).then(() => {
    retrieveClasses(true)
  }).catch(error => {
    console.error(error)
  })
}

function createHomework() {
  let className = document.querySelector('#class').value
  className = className.replace(/\s+/g, '').toUpperCase()

  const deadlineDate = document.querySelector('#deadline-date').value
  const deadlineTime = document.querySelector('#deadline-time').value
  const homework = document.querySelector('#homework').value
  const timezone = (document.querySelector('#chicago-time').checked) ? 'America/Chicago' : 'local'
  const date = luxon.DateTime.fromISO(`${deadlineDate}T${deadlineTime}`, { zone: timezone })
  const uid = authUser.uid

  const hw = {
    deadline: firebase.firestore.Timestamp.fromMillis(date.toMillis()), homework, user: uid
  }
  console.log(hw)

  db.collection('uiuc').doc('tmp').collection(className).add(hw).then(docRef => {
    blink('#create-homework-btn', 'valid', prevFetch)
  }).catch(error => {
    blink('#create-homework-btn', 'error')
  })
}

function deleteHomework(className, uid) {
  db.collection('uiuc').doc('tmp').collection(className).doc(
    uid
  ).delete().then( () => {
    blink(`#${uid} button`, 'valid', prevFetch)
  }).catch(error => {
    blink(`#${uid} button`, 'error')
  })
}

function fetchAndUpdate(startDate, endDate) {
  // NO need to yeet everything
  userData.homework = {}
  let classesList = document.querySelector('#classes-list')
  // Find some way to get appropriate collections in one shot
  const classesPromises = []
  userData.classes.forEach(className => {
    classesPromises.push(
      db.collection('uiuc').doc('tmp').collection(className).where(
        'deadline', '>=' , firebase.firestore.Timestamp.fromDate(startDate)
        // TODO set past homework in the same day as red
      ).where(
        'deadline', '<' , firebase.firestore.Timestamp.fromDate(endDate)
      ).get().then(querySnapshot => {
        // TODO Remove deleted
        querySnapshot.forEach(doc => {
          // TODO Better conflict resolution and sorting
          const date = doc.data().deadline.toDate().toDateString()
          if (!userData.homework[date]) {
            userData.homework[date] = []
          }
          const hw = { uid: doc.id, className, ...doc.data() }
          userData.homework[date].push(hw)
          
          // if (!userData.homeworkIds[doc.id]) {
          //   const date = doc.data().deadline.toDate().toDateString()
          //   console.log(date)
          //   userData.homeworkIds.push(doc.id)
          //   if (!userData.homework[date]) {
          //     userData.homework[date] = []
          //   }
          //   const hw = { uid: doc.id, className, ...doc.data() }
          //   userData.homework[date].push(hw)
  
          //   const item = document.createElement('tr')
          //   item.setAttribute('id', doc.id)
          //   item.innerHTML = `<td>${hw.deadline.toDate().toLocaleTimeString()}</td><td>${hw.className}</td><td>${hw.homework}</td>`
          //   if (hw.user === authUser.uid) {
          //     item.innerHTML += `<td><button type="button" onclick="deleteHomework('${hw.className}', '${hw.uid}')">X</button></td>`
          //   }
          //   classesList.appendChild(item)
          // }
        })
      }).catch(error => {
        console.error(error)
      })
    )
  })
  Promise.all(classesPromises).then(() => {
    const clone = classesList.cloneNode(false)
    classesList.parentNode.replaceChild(clone, classesList)
    classesList = clone
    for (const date in userData.homework) {
      userData.homework[date].sort((a, b) => {
        if (a.deadline > b.deadline) return 1
        if (a.deadline < b.deadline) return -1
        return 0
      })

      const header = document.createElement('tr')
      header.innerHTML = `<td class="section"><b>${date}<b></td>`
      classesList.appendChild(header)
  
      userData.homework[date].forEach(hw => {
        const item = document.createElement('tr')
        item.setAttribute('id', hw.uid)
        item.innerHTML = `<td>${hw.deadline.toDate().toLocaleTimeString()}</td><td>${hw.className}</td><td>${hw.homework}</td>`
        if (hw.user === authUser.uid) {
          item.innerHTML += `<td><button type="button" onclick="deleteHomework('${hw.className}', '${hw.uid}')">X</button></td>`
        }
        classesList.appendChild(item)
      })
    }
  })
}

function fetchToday() {
  prevFetch = fetchToday
  fetchAndUpdate(
    new Date(new Date().setHours(0,0,0,0)),
    new Date(new Date().setHours(24,0,0,0))
  )
}

function fetchThisWeek() {
  prevFetch = fetchThisWeek
  today = new Date(new Date().setHours(0,0,0,0))
  fetchAndUpdate(today, new Date(today.getFullYear(), today.getMonth(), today.getDate()+7))
}

function postFeedback() {
  const content = document.querySelector('#feedback-area').value
  db.collection('feedback').add({ content }).then(docRef => {
    blink('#feedback-btn', 'valid')
  }).catch(error => {
    blink('#feedback-btn', 'error')
  })
}

function init() {
  provider = new firebase.auth.GoogleAuthProvider()
  db = firebase.firestore()

  firebase.auth().onAuthStateChanged((user) => {
    if (user) {
      authUser = user
      retrieveClasses()
      document.querySelector('#username').textContent = user.displayName
      document.querySelector('#login-btn').classList.add('hidden')
      document.querySelector('#logout-btn').classList.remove('hidden')
      document.querySelector('#authenticated').classList.remove('hidden')
    } else {
      authUser = null
      // TODO Clear userData
      document.querySelector('#username').textContent = null
      document.querySelector('#logout-btn').classList.add('hidden')
      document.querySelector('#login-btn').classList.remove('hidden')
      document.querySelector('#authenticated').classList.add('hidden')
    }
  })
}
window.onload = init