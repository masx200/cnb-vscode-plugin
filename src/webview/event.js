const vscode = acquireVsCodeApi();

let eventMap = {}

function call(event, data, callback) {
    let eventid = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    eventMap[eventid] = callback;
    vscode.postMessage({
        command: event,
        ...data,
        eventid: eventid
    });
}

window.addEventListener('message', event => {
    const message = event.data;
    let eventid = message.eventid;
    if (eventid && eventMap[eventid]) {
        eventMap[eventid](message);
        if(message.autoDelete !== false)
            delete eventMap[eventid];
    }else{
        console.log('eventid not found', eventid);
    }
});

