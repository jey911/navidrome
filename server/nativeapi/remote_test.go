package nativeapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"

	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/request"
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

var _ = Describe("Remote Endpoints", func() {
	user := model.User{ID: "u9", UserName: "remote-user"}

	withUser := func(req *http.Request) *http.Request {
		return req.WithContext(request.WithUser(req.Context(), user))
	}

	announce := func(name string) (string, string) {
		body, _ := json.Marshal(map[string]string{"name": name})
		req := withUser(httptest.NewRequest("POST", "/remote/announce", bytes.NewReader(body)))
		w := httptest.NewRecorder()
		announceRemoteSession(w, req)
		Expect(w.Code).To(Equal(http.StatusOK))
		var out map[string]string
		Expect(json.Unmarshal(w.Body.Bytes(), &out)).To(Succeed())
		return out["sessionId"], out["code"]
	}

	It("announces a session and lists it", func() {
		sessionID, code := announce("Laptop")
		Expect(sessionID).ToNot(BeEmpty())
		Expect(code).To(HaveLen(4))

		req := withUser(httptest.NewRequest("GET", "/remote/sessions", nil))
		w := httptest.NewRecorder()
		listRemoteSessions(w, req)
		Expect(w.Code).To(Equal(http.StatusOK))
		Expect(w.Body.String()).To(ContainSubstring(sessionID))
	})

	It("rejects commands with wrong code", func() {
		sessionID, _ := announce("Laptop")
		body, _ := json.Marshal(map[string]string{
			"sessionId": sessionID, "code": "invalid", "action": "next",
		})
		req := withUser(httptest.NewRequest("POST", "/remote/command", bytes.NewReader(body)))
		w := httptest.NewRecorder()
		postRemoteCommand(w, req)
		Expect(w.Code).To(Equal(http.StatusForbidden))
	})

	It("keeps a newly announced session while its first state is pending", func() {
		sessionID, _ := announce("Laptop")
		w := httptest.NewRecorder()
		getRemoteState(w, withUser(httptest.NewRequest("GET", "/remote/state?sessionId="+sessionID, nil)))
		Expect(w.Code).To(Equal(http.StatusNoContent))
	})

	It("rejects unknown actions", func() {
		sessionID, code := announce("Laptop")
		body, _ := json.Marshal(map[string]string{
			"sessionId": sessionID, "code": code, "action": "reboot",
		})
		req := withUser(httptest.NewRequest("POST", "/remote/command", bytes.NewReader(body)))
		w := httptest.NewRecorder()
		postRemoteCommand(w, req)
		Expect(w.Code).To(Equal(http.StatusUnprocessableEntity))
	})

	It("accepts queue, play-next and delete commands from the remote", func() {
		sessionID, code := announce("Laptop")
		for _, action := range []string{"queueTrack", "playNextTrack", "removeQueuedTrack", "deleteTrack"} {
			body, _ := json.Marshal(map[string]any{
				"sessionId": sessionID, "code": code, "action": action,
				"payload": map[string]any{"id": "song-1"},
			})
			req := withUser(httptest.NewRequest("POST", "/remote/command", bytes.NewReader(body)))
			w := httptest.NewRecorder()
			postRemoteCommand(w, req)
			Expect(w.Code).To(Equal(http.StatusNoContent))
		}
	})

	It("accepts a command and exposes it as pending once", func() {
		sessionID, code := announce("Laptop")
		body, _ := json.Marshal(map[string]any{
			"sessionId": sessionID, "code": code, "action": "volume",
			"payload": map[string]any{"level": 0.5},
		})
		req := withUser(httptest.NewRequest("POST", "/remote/command", bytes.NewReader(body)))
		w := httptest.NewRecorder()
		postRemoteCommand(w, req)
		Expect(w.Code).To(Equal(http.StatusNoContent))

		pending := withUser(httptest.NewRequest(
			"GET", "/remote/pending?sessionId="+sessionID+"&code="+code, nil))
		w2 := httptest.NewRecorder()
		getRemotePending(w2, pending)
		Expect(w2.Code).To(Equal(http.StatusOK))
		Expect(w2.Body.String()).To(ContainSubstring("volume"))

		// Se consume una sola vez (red de seguridad SSE)
		w3 := httptest.NewRecorder()
		getRemotePending(w3, withUser(httptest.NewRequest(
			"GET", "/remote/pending?sessionId="+sessionID+"&code="+code, nil)))
		Expect(w3.Code).To(Equal(http.StatusNoContent))
	})

	It("publishes and reads playback state", func() {
		sessionID, code := announce("Laptop")
		body, _ := json.Marshal(map[string]any{
			"sessionId": sessionID, "code": code,
			"state": map[string]any{"title": "T1", "artist": "A", "playing": true, "notice": "Borrada: T1", "positionMs": 61000, "durationMs": 240000, "volume": 0, "commandId": "request-1", "queue": []map[string]string{{"id": "song-2", "queueId": "entry-2", "title": "Pending", "artist": "Artist"}}},
		})
		req := withUser(httptest.NewRequest("POST", "/remote/state", bytes.NewReader(body)))
		w := httptest.NewRecorder()
		postRemoteState(w, req)
		Expect(w.Code).To(Equal(http.StatusNoContent))

		get := withUser(httptest.NewRequest(
			"GET", "/remote/state?sessionId="+sessionID, nil))
		w2 := httptest.NewRecorder()
		getRemoteState(w2, get)
		Expect(w2.Code).To(Equal(http.StatusOK))
		Expect(w2.Body.String()).To(ContainSubstring("T1"))
		Expect(w2.Body.String()).To(ContainSubstring("Borrada"))
		Expect(w2.Body.String()).To(ContainSubstring("durationMs"))
		Expect(w2.Body.String()).To(ContainSubstring(`"volume":0`))
		Expect(w2.Body.String()).To(ContainSubstring(`"commandId":"request-1"`))
		Expect(w2.Body.String()).To(ContainSubstring(`"title":"Pending"`))
		Expect(w2.Body.String()).To(ContainSubstring(`"queueId":"entry-2"`))
	})
})
