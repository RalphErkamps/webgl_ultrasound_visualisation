var loadVolume = function(file, onload) {
	var m = file.match(fileRegex);
	var volDims = [parseInt(m[2]), parseInt(m[3]), parseInt(m[4])];
	
	var url = "https://www.dl.dropboxusercontent.com/s/" + file + "?dl=1";
	var req = new XMLHttpRequest();
	var loadingProgressText = document.getElementById("loadingText");
	var loadingProgressBar = document.getElementById("loadingProgressBar");

	loadingProgressText.innerHTML = "Loading Volume";
	loadingProgressBar.setAttribute("style", "width: 0%");

	req.open("GET", url, true);
	req.responseType = "arraybuffer";
	req.onprogress = function(evt) {
		var vol_size = volDims[0] * volDims[1] * volDims[2];
		var percent = evt.loaded / vol_size * 100;
		loadingProgressBar.setAttribute("style", "width: " + percent.toFixed(2) + "%");
	};
	req.onerror = function(evt) {
		loadingProgressText.innerHTML = "Error Loading Volume";
		loadingProgressBar.setAttribute("style", "width: 0%");
	};
	req.onload = function(evt) {
		loadingProgressText.innerHTML = "Loaded Volume";
		loadingProgressBar.setAttribute("style", "width: 100%");
		var dataBuffer = req.response;
		if (dataBuffer) {
			dataBuffer = new Uint8Array(dataBuffer);
			onload(file, dataBuffer);
		} else {
			alert("Unable to load buffer properly from volume?");
			console.log("no buffer?");
		}
	};
	req.send();
}

// Create option for each volume
var fillVolumeSelector = function() {
	var selector = document.getElementById("volumeList");
	for (v in volumes) {
		var opt = document.createElement("option");
		opt.value = v;
		opt.innerHTML = v;
		selector.appendChild(opt);
	}
}

// Create option for each colormap
var fillcolormapSelector = function() {
	var selector = document.getElementById("colormapList");
	for (p in colormaps) {
		var opt = document.createElement("option");
		opt.value = p;
		opt.innerHTML = p;
		selector.appendChild(opt);
	}
}

// Called when the user selects a colormap
var selectColormap = function() {
	var selection = document.getElementById("colormapList").value;
	var colormapImage = new Image();
	colormapImage.onload = function() {
		gl.activeTexture(gl.TEXTURE1);
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 180, 1,
			gl.RGBA, gl.UNSIGNED_BYTE, colormapImage);
	};
	colormapImage.src = colormaps[selection];
}

var setupUI = function() {
	// Setup a ui.
	webglLessonsUI.setupSlider("#x", {value: translation[0], slide: translateX(), min: -100, max: 100});
	webglLessonsUI.setupSlider("#y", {value: translation[1], slide: translateY(), min: -100, max: 100});
	webglLessonsUI.setupSlider("#z", {value: translation[2], slide: translateZ(), min: -100, max: 100});

	function translateX() {
		return function(event, ui) {
		  translation[0] = ui.value / 100; // Convert pixel value to values between -1 and 1
		};
	  }
	
	function translateY() {
		return function(event, ui) {
		  translation[1] = ui.value / 100; // Convert pixel value to values between -1 and 1
		};
	}
	
	function translateZ() {
		return function(event, ui) {
		  translation[2] = ui.value / 100; // Convert pixel value to values between -1 and 1
		};
	}

	webglLessonsUI.setupSlider("#rotateX", {value: rotation[0], slide: rotateX(), min: -180, max: 180});
	webglLessonsUI.setupSlider("#rotateY", {value: rotation[1], slide: rotateY(), min: -180, max: 180});
	webglLessonsUI.setupSlider("#rotateZ", {value: rotation[2], slide: rotateZ(), min: -180, max: 180});
	function rotateX() {
		return function(event, ui) {
			rotation[0] = -(ui.value / 180)* Math.PI;
		};
	}

	function rotateY() {
		return function(event, ui) {
			rotation[1] = -(ui.value / 180)* Math.PI;
		};
	}

	function rotateZ() {
		return function(event, ui) {
			rotation[2] = -(ui.value / 180)* Math.PI;
		};
	}
}

var createBoundingPrimitive = function() {
    // Setup VAO and VBO to render the cube to run the raymarching shader
	var vao = gl.createVertexArray();
	gl.bindVertexArray(vao);

	var vbo = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cubeStrip), gl.STATIC_DRAW);

	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
}

function toggleClippingPlane() {
	if (show_clipping_plane == 1.0) {
		show_clipping_plane = 0.0;
		gl.uniform1f(shader.uniforms["show_clipping_plane"], show_clipping_plane);
	} else {
		show_clipping_plane = 1.0;
		gl.uniform1f(shader.uniforms["show_clipping_plane"], show_clipping_plane);
	}
}