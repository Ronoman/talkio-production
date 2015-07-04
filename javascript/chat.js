$(document).ready(function() {
    var socket = io();

    if(Cookies.get('token') != null && Cookies.get('token') != "") {
        console.log(Cookies.get('token'));
        socket.emit('loginToken', {token: Cookies.get('token')});
    }

    var leftchannel = [];
    var rightchannel = [];
    var recorder = null;
    var recording = false;
    var recordingLength = 0;
    var volume = null;
    var audioInput = null;
    var sampleRate = null;
    var audioContext = null;
    var context = null;
    var outputString;
    var blob = null;

    var username = null;
    var loggedin = false;
    var token = null;

    // feature detection 
    if (!navigator.getUserMedia)
        navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia ||
                      navigator.mozGetUserMedia || navigator.msGetUserMedia;

    if (navigator.getUserMedia){
        navigator.getUserMedia({audio:true}, success, function(e) {
        alert('Error capturing audio: ' + e);
        });
    } else alert('getUserMedia not supported in this browser. Switch to the newest version of chrome.');

    // when key is down

    
    // if R is pressed, we start recording
    $('button#record').click(function() {
    	if(!recording) {
    		socket.emit('recording', {token: Cookies.get('token')});
    	}
        blob = null;
    	console.log("Record pressed");
        recording = true;
        // reset the buffers for the new recording
        leftchannel.length = rightchannel.length = 0;
        recordingLength = 0;
    });
    $('button#stop').click(function() {
    	socket.emit('stoppedRecording', {token: Cookies.get('token')});
        
        // we stop recording
        recording = false;

        // we flat the left and right channels down
        var leftBuffer = mergeBuffers ( leftchannel, recordingLength );
        var rightBuffer = mergeBuffers ( rightchannel, recordingLength );
        // we interleave both channels together
        var interleaved = interleave ( leftBuffer, rightBuffer );
        
        // we create our wav file
        var buffer = new ArrayBuffer(44 + interleaved.length * 2);
        var view = new DataView(buffer);
        
        // RIFF chunk descriptor
        writeUTFBytes(view, 0, 'RIFF');
        view.setUint32(4, 44 + interleaved.length * 2, true);
        writeUTFBytes(view, 8, 'WAVE');
        // FMT sub-chunk
        writeUTFBytes(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        // stereo (2 channels)
        view.setUint16(22, 2, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 4, true);
        view.setUint16(32, 4, true);
        view.setUint16(34, 16, true);
        // data sub-chunk
        writeUTFBytes(view, 36, 'data');
        view.setUint32(40, interleaved.length * 2, true);
        
        // write the PCM samples
        var lng = interleaved.length;
        var index = 44;
        var volume = 1;
        for (var i = 0; i < lng; i++){
            view.setInt16(index, interleaved[i] * (0x7FFF * volume), true);
            index += 2;
        }
        
        // our final binary blob
        blob = new Blob ( [ view ], { type : 'audio/wav' } );
        

        var url = (window.URL || window.webkitURL).createObjectURL(blob);
        document.getElementById('localSource').src = url;
        document.getElementById('localPlay').load()
        console.log(blob);
    });


    function interleave(leftChannel, rightChannel){
      var length = leftChannel.length + rightChannel.length;
      var result = new Float32Array(length);

      var inputIndex = 0;

      for (var index = 0; index < length; ){
        result[index++] = leftChannel[inputIndex];
        result[index++] = rightChannel[inputIndex];
        inputIndex++;
      }
      return result;
    }

    function mergeBuffers(channelBuffer, recordingLength){
      var result = new Float32Array(recordingLength);
      var offset = 0;
      var lng = channelBuffer.length;
      for (var i = 0; i < lng; i++){
        var buffer = channelBuffer[i];
        result.set(buffer, offset);
        offset += buffer.length;
      }
      return result;
    }

    function writeUTFBytes(view, offset, string){ 
      var lng = string.length;
      for (var i = 0; i < lng; i++){
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    }

    function success(e){
        // creates the audio context
        audioContext = window.AudioContext || window.webkitAudioContext;
        context = new audioContext();

    	// we query the context sample rate (varies depending on platforms)
        sampleRate = context.sampleRate;

        console.log('succcess');
        
        // creates a gain node
        volume = context.createGain();

        // creates an audio node from the microphone incoming stream
        audioInput = context.createMediaStreamSource(e);

        // connect the stream to the gain node
        audioInput.connect(volume);

        /* From the spec: This value controls how frequently the audioprocess event is 
        dispatched and how many sample-frames need to be processed each call. 
        Lower values for buffer size will result in a lower (better) latency. 
        Higher values will be necessary to avoid audio breakup and glitches */
        var bufferSize = 2048;
        recorder = context.createScriptProcessor(bufferSize, 2, 2);

        recorder.onaudioprocess = function(e){
            if (!recording) return;
            var left = e.inputBuffer.getChannelData (0);
            var right = e.inputBuffer.getChannelData (1);
            // we clone the samples
            leftchannel.push (new Float32Array (left));
            rightchannel.push (new Float32Array (right));
            recordingLength += bufferSize;
            console.log('recording');
        }

        // we connect the recorder
        volume.connect (recorder);
        recorder.connect (context.destination); 
    }

    function doLoginRegister(){
        if($('#username').val() != "") {
            if($('#password').val() != "" && $('#registerEmail').val() == "" && $('#registerUsername').val() == "" && $('#registerPassword').val() == "") {
                socket.emit('loginNormal', {username: $('#username').val(), password: $('#password').val()});
            } else {
                alert("Please check you have filled out the form correctly!");
            }
        } else if($('#registerUsername').val() != "") {
            if($('#registerPassword').val() != "" && $('#username').val() == "" && $('#password').val() == "") {
                socket.emit('register', {username: $('#registerUsername').val(), password: $('#registerPassword').val(), email: $('#registerEmail').val()});
            } else {
                alert("Please check you have filled out the form correctly!");
            }
        }
    }

    $('button#send').click(function() {
    	socket.emit('blob', {token: Cookies.get('token'), blob: blob, username: username});
    });

    $('button#review').click(function() {
        document.getElementById('localPlay').play();
    });

    $('button#login').click(function() {
        if(loggedin) {
            socket.emit('logout');
            Cookies.remove('token');
            location.reload();
            return;
        }
        doLoginRegister();
    });

    $('input#password').keypress(function(e){
        if(e.which == 13) doLoginRegister();
    });

    $('input#registerPassword').keypress(function(e){
        if(e.which == 13) doLoginRegister();
    });


    /* ORIGINAL "LOGIN" SYSTEM, VERY OUTDATED
    socket.on('getUsername', function() {
        username = prompt("Username plz");
        socket.emit('username', {username: username});
    });
    */

    socket.on('play', function(data) { //Will change on implement rooms
    	console.log(data.blob);
    	data.blob = new Blob([data.blob], { type : 'audio/wav' });
    	console.log(data.blob);
        if(data.username != username) {
            console.log(username);
            console.log(data.username);
    	    var url = (window.URL || window.webkitURL).createObjectURL(data.blob);
            document.getElementById('globalSource').src = url;
            document.getElementById('globalPlay').load()
            document.getElementById('globalPlay').play()
        }
    });

    socket.on('newUser', function(data) {
        if(loggedin) {
    	   var list = document.getElementById('userFeed');
    	   var li = document.createElement("li");
    	   li.appendChild(document.createTextNode(data.user));
    	   li.setAttribute('id', data.user + "List");
           li.setAttribute('class', 'list-group-item');
    	   list.appendChild(li);
        }
    });

    socket.on('userLeft', function(data) {
    	var li = document.getElementById(data.user + "List");
    	li.parentNode.removeChild(li);
    });

    socket.on('userRecording', function(data) {
    	var list = document.getElementById('recordingFeed');
    	var li = document.createElement("li");
    	li.appendChild(document.createTextNode(data.user));
    	li.setAttribute('id', data.user + "Recording");
        li.setAttribute('class', 'list-group-item');
    	list.appendChild(li);
    });

    socket.on('userNotRecording', function(data) {
    	var li = document.getElementById(data.user + "Recording");
    	li.parentNode.removeChild(li);
    });

    socket.on('registrationComplete', function() {
        //reset the form values
        $('input#username').val($('input#registerUsername').val());
        $('input#registerEmail').val("");
        $('input#registerUsername').val("");
        $('input#registerPassword').val("");
        alert("Registration complete! You are now logged in.");
    });

    socket.on('token', function(data) {
        Cookies.set('token', data.token, {expires: 7});
    });

    socket.on('registerError', function(data) {
        alert(data.type);
    });

    socket.on('loginError', function(data) {
        console.log("Login error!");
        alert(data.type);
    });

    socket.on('loggedIn', function(data) {
        loggedin = true;
        username = data.username;
        $('#login').html('Logout');
        $('#loginModal').modal('hide');
    });

    socket.on('reload', function() {
        alert("Something went wrong! Reloading the webpage...");
        setTimeout(function() {
            location.reload();
        });
    });

});