var cubeStrip = [
	1, 1, 0,
	0, 1, 0,
	1, 1, 1,
	0, 1, 1,
	0, 0, 1,
	0, 1, 0,
	0, 0, 0,
	1, 1, 0,
	1, 0, 0,
	1, 1, 1,
	1, 0, 1,
	0, 0, 1,
	1, 0, 0,
	0, 0, 0
];

var canvas = null;
var gl = null;
var shader = null;
var volumeTexture = null;
var colormapTex = null;
var fileRegex = /.*\/(\w+)_(\d+)x(\d+)x(\d+)_(\w+)\.*/;
var proj = null;
var camera = null;
var projView = null;
var tabFocused = true;
var newVolumeUpload = true;
var targetFrameTime = 32;
var samplingRate = 1.0;
var WIDTH = 640;
var HEIGHT = 480;

// Clipping plane variables
var rotation = [0.0, 0.0, 0,0];
var translation = [0.0, 0.0, 0.0];
var plane_pos_vec = vec3.set(vec3.create(), 0.5, 0.5, 0.5)
var plane_nor_vec = vec3.set(vec3.create(), 0.0, 0.0, -1.0);
var show_clipping_plane = 1.0;

// Camera variables
const defaultEye = vec3.set(vec3.create(), 0.5, 0.5, 1.5);
const center = vec3.set(vec3.create(), 0.5, 0.5, 0.5);
const up = vec3.set(vec3.create(), 0.0, 1.0, 0.0);

var volumes = {
	"Ultrasound": "6kg4jjwivozy45x/ultrasound_595x368x362_uint8.raw",
	"Bonsai": "rdnhdxmxtfxe0sa/bonsai_256x256x256_uint8.raw",
	"Fuel": "7d87jcsh0qodk78/fuel_64x64x64_uint8.raw",
	"Neghip": "zgocya7h33nltu9/neghip_64x64x64_uint8.raw",
	"Hydrogen Atom": "jwbav8s3wmmxd5x/hydrogen_atom_128x128x128_uint8.raw",
	"Boston Teapot": "w4y88hlf2nbduiv/boston_teapot_256x256x178_uint8.raw",
	"Engine": "ld2sqwwd3vaq4zf/engine_256x256x128_uint8.raw",
	"Foot": "ic0mik3qv4vqacm/foot_256x256x256_uint8.raw",
	"Skull": "5rfjobn0lvb7tmo/skull_256x256x256_uint8.raw",
	"Aneurysm": "3ykigaiym8uiwbp/aneurism_256x256x256_uint8.raw",
};

var colormaps = {
	"Cool Warm": "colormaps/cool-warm-paraview.png",
};

var selectVolume = function() {
	var selection = document.getElementById("volumeList").value;
	history.replaceState(history.state, "#" + selection, "#" + selection);

	loadVolume(volumes[selection], function(file, dataBuffer) {
		var m = file.match(fileRegex);
		var volDims = [parseInt(m[2]), parseInt(m[3]), parseInt(m[4])];

		var tex = gl.createTexture();
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_3D, tex);
		// robbel: added to get this to work for data sets that are not aligned to four-value multiples (which is the default UNPACK_ALIGNMENT)
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		gl.texStorage3D(gl.TEXTURE_3D, 1, gl.R8, volDims[0], volDims[1], volDims[2]);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0,
					     volDims[0], volDims[1], volDims[2],
			 			 gl.RED, gl.UNSIGNED_BYTE, dataBuffer);

		var longestAxis = Math.max(volDims[0], Math.max(volDims[1], volDims[2]));
		var volScale = [volDims[0] / longestAxis, volDims[1] / longestAxis,
			volDims[2] / longestAxis];

		gl.uniform3iv(shader.uniforms["volume_dims"], volDims);
		gl.uniform3fv(shader.uniforms["volume_scale"], volScale);

		newVolumeUpload = true;
		if (!volumeTexture) {
			volumeTexture = tex;
			setInterval(function() {
				shader.use(gl);
				// Save them some battery if they're not viewing the tab
				if (document.hidden) {
					return;
				}
				var startTime = new Date();
				gl.clearColor(0.0, 0.0, 0.0, 1.0);
				gl.clear(gl.COLOR_BUFFER_BIT);

				// Reset the sampling rate and camera for new volumes
				if (newVolumeUpload) {
					camera = new ArcballCamera(defaultEye, center, up, 2, [WIDTH, HEIGHT]);
					samplingRate = 1.0;
					gl.uniform1f(shader.uniforms["dt_scale"], samplingRate);
				}
				projView = mat4.mul(projView, proj, camera.camera);
				gl.uniformMatrix4fv(shader.uniforms["proj_view"], false, projView);

				var eye = [camera.invCamera[12], camera.invCamera[13], camera.invCamera[14]];
				gl.uniform3fv(shader.uniforms["eye_pos"], eye);

				var temp = vec3.rotateX(vec3.create(), plane_nor_vec, plane_pos_vec, rotation[0]);
				vec3.rotateY(temp, temp, plane_pos_vec, rotation[1]);
				vec3.rotateZ(temp, temp, plane_pos_vec, rotation[2]);
				gl.uniform3fv(shader.uniforms["plane_nor_vec"], temp);

				gl.uniform3fv(shader.uniforms["plane_pos_vec"], [0.5 + translation[0], 0.5 + translation[1], 0.5 + translation[2]]);

				gl.drawArrays(gl.TRIANGLE_STRIP, 0, cubeStrip.length / 3);
				gl.finish();
				var endTime = new Date();
				var renderTime = endTime - startTime;
				var targetSamplingRate = renderTime / targetFrameTime;

				// If we're dropping frames, decrease the sampling rate
				if (!newVolumeUpload && targetSamplingRate > samplingRate) {
					samplingRate = 0.8 * samplingRate + 0.2 * targetSamplingRate;
					gl.uniform1f(shader.uniforms["dt_scale"], samplingRate);
				}

				newVolumeUpload = false;
				startTime = endTime;
			}, targetFrameTime);
		} else {
			gl.deleteTexture(volumeTexture);
			volumeTexture = tex;
		}
	});
}

window.onload = function(){
	// Load volume and colormap options
	fillVolumeSelector();
	fillcolormapSelector();

	// --------------------------------------------------------------------------
	// WEB-GL INITALISATION -----------------------------------------------------
	// --------------------------------------------------------------------------

	//  Retrieve web-gl context, return when no context can be created.
	canvas = document.getElementById("glcanvas");
	gl = canvas.getContext("webgl2");
	if (!gl) {
		alert("Unable to initialize WebGL2. Your browser may not support it");
		return;
	}

	// Retrieve the dimensions from the canvas
	WIDTH = canvas.getAttribute("width");
	HEIGHT = canvas.getAttribute("height");

	// Create projection-matrix which transforms world coordinates to screen coordinates.
	// mat4.perspective(destination matrix, field of view, aspect ration, near, far);
	proj = mat4.perspective(mat4.create(), 60 * Math.PI / 180.0, WIDTH / HEIGHT, 0.1, 100);

	// Create shading programs
	shader = new Shader(gl, vertShader, fragShader);

	// -------------------------------------------------------------------------- 
	// Initialise shaders -------------------------------------------------------
	// --------------------------------------------------------------------------

	// shader
	shader.use(gl);
	gl.uniform1i(shader.uniforms["volume"], 0);
	gl.uniform1i(shader.uniforms["colormap"], 1);
	gl.uniform1f(shader.uniforms["dt_scale"], 1.0);
	gl.uniform1f(shader.uniforms["show_clipping_plane"], show_clipping_plane);

	// --------------------------------------------------------------------------
	// Camera initialisation ----------------------------------------------------
	// --------------------------------------------------------------------------
	
	camera = new ArcballCamera(defaultEye, center, up, 2, [WIDTH, HEIGHT]);

	// Register mouse and touch listeners
	var controller = new Controller();
	controller.mousemove = function(prev, cur, evt) {
		if (evt.buttons == 1) {
			camera.rotate(prev, cur);

		} else if (evt.buttons == 2) {
			camera.pan([cur[0] - prev[0], prev[1] - cur[1]]);
		}
	};
	controller.wheel = function(amt) { camera.zoom(amt); };
	controller.pinch = controller.wheel;
	controller.twoFingerDrag = function(drag) { camera.pan(drag); };

	controller.registerForCanvas(canvas);

	// -------------------------------------------------------------------------- 
	// Setup initial-state -------------------------------------------------------
	// --------------------------------------------------------------------------

	projView = mat4.create();

	// Create a cuboid used for the rayracing algorithm
	createBoundingPrimitive()

	// Create user interface for interaction with the objects
	setupUI();

	// Setup required OpenGL state for drawing the back faces and
	// composting with the background color
	gl.enable(gl.CULL_FACE);
	gl.cullFace(gl.FRONT);
	gl.enable(gl.BLEND);
	gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

	// Load the default colormap and upload it, after which we
	// load the default volume.
	var colormapImage = new Image();
	colormapImage.onload = function() {
		// Create texture from image
		var colormap = gl.createTexture();
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, colormap);
		gl.texStorage2D(gl.TEXTURE_2D, 1, gl.SRGB8_ALPHA8, 180, 1);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 180, 1,
						 gl.RGBA, gl.UNSIGNED_BYTE, colormapImage);
		// SelectVolume starts rendering loop
		selectVolume();
	};
	colormapImage.src = "colormaps/cool-warm-paraview.png";
	
}