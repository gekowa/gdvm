var taskStatus = {
	"Init": 0,
	"Downloading": 10,
	"Downloaded": 20,
	"Transcoding": 25,	// transcode
	"Transcoded": 26,
	"PendingUpload": 28,
	"Uploading": 30,
	"Uploaded": 40,
	"Error": 50
};

exports.TASK_STATUS = taskStatus;