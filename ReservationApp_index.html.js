<!DOCTYPE html>
<html>

<head>
  <base target="_top">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/materialize/1.0.0/css/materialize.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/materialize/1.0.0/js/materialize.min.js"></script>
  <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
  <style>
    .map table {
      margin: auto;
      max-width: 100%;
      border-spacing: 0;
      border-collapse: collapse;
    }

    .map table td {
      padding: 0;
      height: 0;
      border-bottom: 1px solid black;
      border-right: 1px solid black;
      border-radius: 0;
    }

    .map table td:first-child {
      border-left: 1px solid black;
    }

    .map table tr:first-child td {
      border-top: 1px solid black;
    }

    border-top: 1px solid black;
  </style>
</head>

<body>
  <nav class="teal darken-3">
    <div class="nav-wrapper">
      <div class="brand-logo center">
        <?!= explanationOfReservationPage ?>
      </div>
      <ul class="right hide-on-med-and-down">
        <li><a href="mailto:<?= contactEmail ?>">Contact</a></li>
      </ul>
    </div>
  </nav>
  <div class="map" id="table1">
    <?!= table ?>
  </div>

  <!-- Modal Structure -->
  <div id="modal1" class="modal modal-fixed-footer">
    <div class="modal-content">
      <h3>Reservation form</h3>
      <div class="alert card blue lighten-4 blue-text text-darken-3">
        <div class="card-content">
          <h6 id="modal_text1"></h6>
          <h6 id="modal_text2"></h6>
          <p>Please select the start time from the table. In this case, the end time is automatically calculated.</p>
          <p>
            <?!= agreementsForReservation ?>
          </p>
        </div>
      </div>
      <div class="row">
        <form class="col s12">
          <div class="row">
            <div class="input-field col s6">
              <i class="material-icons prefix">account_circle</i>
              <input type="text" name="name" id="name" class="validate" required>
              <label for="name">Please input your name.</label>
            </div>
            <div class="input-field col s6">
              <i class="material-icons prefix">email</i>
              <input type="email" name="email" id="email" class="validate" required>
              <label for="email">Please input your email address.</label>
            </div>
          </div>
          <div class="row">
            <div class="input-field col s6">
              <i class="material-icons prefix">phone</i>
              <input type="text" name="phone" id="phone" class="validate" required>
              <label for="phone">Please input your phone number.</label>
            </div>
            <div class="input-field col s6">
              <i class="material-icons prefix">people</i>
              <input type="number" name="numberPersons" id="numberPersons" min="1" class="validate" required>
              <label for="numberPersons">Please input number of persons.</label>
            </div>
          </div>
          <div class="row">
            <div class="input-field col s12">
              <i class="material-icons prefix">comment</i>
              <textarea id="comment" name="comment" class="materialize-textarea"></textarea>
              <label for="comment">Please input your comment.</label>
            </div>
          </div>
          <div id="div_reservedDateTime"><input type="hidden" name="reservedDateTime" id="reservedDateTime"></div>
          <input type="button" id="reserveButton" class="btn waves-effect waves-light" value="Reserve" onclick="reserve(this);">
        </form>
      </div>
      <div class="progress" id="progress" style="display:none">
        <div class="indeterminate"></div>
      </div>
      <div id="success" class="alert card red lighten-4 red-text"></div>
    </div>
    <div class="modal-footer">
      <div class="modal-action modal-close waves-effect waves-green btn" id="closeButton">Close</div>
    </div>
  </div>

<script>
document.addEventListener('DOMContentLoaded', function () {
  const elems = document.querySelectorAll('.modal');
  const instances = M.Modal.init(elems, {
    onOpenStart: function (a, b) {
      if (a.getAttribute("id") == "modal1") {
        const button1 = document.getElementById("reserveButton");
        const button2 = document.getElementById("closeButton");
        button1.disabled = false;
        button2.classList.remove("disabled");
        const obj_str = b.getAttribute("value");
        const o = JSON.parse(obj_str);
        document.getElementById("modal_text1").innerHTML = `Reserve from ${o.startTime} to ${o.endTime} on ${o.date}.`;
        document.getElementById("modal_text2").innerHTML = `Now, ${o.remainingSeats} seats are remaining.`;
        document.getElementById("numberPersons").setAttribute("max", o.remainingSeats);
        document.getElementById("reservedDateTime").value = obj_str;
        ["name", "email", "phone", "numberPersons", "comment"].forEach(id => document.getElementById(id).value = "");
        document.getElementById("success").innerHTML = ""
      }
    }
  });
});

function reserve(e) {
  const div_progress = document.getElementById("progress");
  const div = document.getElementById("success");
  div.innerHTML = "";
  div_progress.style.display = 'block';
  const values = [...e.parentNode.parentNode].reduce((o, { name, value }) => {
    if (name) {
      if (name == "reservedDateTime") {
        o[name] = JSON.parse(value);
      } else if (name == "phone") {
        o[name] = `'${value}`;
      } else if (value != "" && !isNaN(value)) {
        o[name] = Number(value);
      } else {
        o[name] = value;
      }
    }
    return o;
  }, {});
  const numberPersons = values.numberPersons;
  const remainingSeats = values.reservedDateTime.remainingSeats;
  if (remainingSeats - numberPersons < 0) {
    div_progress.style.display = 'none';
    div.setAttribute("class", "alert card red lighten-4 red-text");
    div.innerHTML = '<i class="material-icons">report</i>' + `Number of ${numberPersons} cannot be reserved.`;
    return;
  }
  if (["name", "email", "phone", "numberPersons"].some(f => !values[f].toString() || values[f] == "'")) {
    div_progress.style.display = 'none';
    div.setAttribute("class", "alert card red lighten-4 red-text");
    div.innerHTML = '<i class="material-icons">report</i>' + 'Please input all values of "name", "email", "phone", and "numberPersons".';
    return;
  }

  const button1 = document.getElementById("reserveButton");
  const button2 = document.getElementById("closeButton");
  button1.disabled = true;
  button2.classList.add("disabled");
  google.script.run.withSuccessHandler(r => {
    button2.classList.remove("disabled");
    div_progress.style.display = 'none';
    if (r.done) {
      div.setAttribute("class", "alert card green white-text");
      div.innerHTML = '<i class="material-icons">check_circle</i>' + "Reserved. Please close this dialog.";
      document.getElementById("table1").innerHTML = r.newTable;
    } else {
      div.setAttribute("class", "alert card red lighten-4 red-text");
      div.innerHTML = '<i class="material-icons">report</i>' + r.error.msg;
    }
  }).putValues(values);
}
</script>

</body>

</html>
