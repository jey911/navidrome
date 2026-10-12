package nativeapi

// Control remoto casa: el móvil como mando del reproductor web del laptop.
// El audio SIEMPRE suena en el laptop; el móvil solo envía órdenes.
//
// Flujo:
//  1. Laptop: POST /api/remote/announce {name} -> {sessionId, code}.
//     El código de 4 dígitos se muestra en el reproductor.
//  2. Móvil: GET /api/remote/sessions (ver sesiones activas),
//     POST /api/remote/command {sessionId, code, action, payload}.
//  3. Laptop: recibe el comando por SSE (evento remoteCommand) o por
//     GET /api/remote/pending (red de seguridad) y lo ejecuta en su
//     reproductor local. Publica su estado con POST /api/remote/state.
//  4. Móvil: lee GET /api/remote/state?sessionId= para ver qué suena.
//
// Todo vive en memoria por usuario (sin migraciones de BD) y exige el
// mismo login de Navidrome en ambos dispositivos. Sin el código de la
// pantalla del laptop, otro dispositivo no puede comandarlo.

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/navidrome/navidrome/model/request"
	"github.com/navidrome/navidrome/server/events"
)

// Acciones válidas (whitelist: nada fuera de esto se ejecuta).
// playTrack: reproduce ahora (reemplaza la cola).
// playNextTrack: inserta justo después del tema actual (prioridad manual).
// queueTrack: añade después de las peticiones manuales pendientes (suena
// antes que el relleno automático artista=>género del Auto-DJ).
// deleteTrack: borra el archivo de la biblioteca (lo ejecuta el laptop vía
// Emepetre, mismo origen /downloader; Navidrome monta /music en :ro y no
// puede borrar por sí mismo). Irreversible: el mando pide confirmación.
var remoteActions = map[string]bool{
	"play":          true,
	"pause":         true,
	"toggle":        true,
	"next":          true,
	"prev":          true,
	"volume":        true,
	"seek":          true,
	"playTrack":     true,
	"playNextTrack": true,
	"queueTrack":    true,
	"deleteTrack":   true,
}

type remoteCommand struct {
	ID      string          `json:"id"`
	Action  string          `json:"action"`
	Payload json.RawMessage `json:"payload,omitempty"`
	At      time.Time       `json:"at"`
}

type remoteQueueItem struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Artist string `json:"artist"`
}

type remotePlaybackState struct {
	Queue        []remoteQueueItem `json:"queue"`
	CommandID    string            `json:"commandId,omitempty"`
	CommandError string            `json:"commandError,omitempty"`
	TrackID      string            `json:"trackId,omitempty"`
	Title        string            `json:"title,omitempty"`
	NextTitle    string            `json:"nextTitle,omitempty"`
	NextArtist   string            `json:"nextArtist,omitempty"`
	Artist       string            `json:"artist,omitempty"`
	Playing      bool              `json:"playing"`
	Volume       float64           `json:"volume"`
	Position     int64             `json:"positionMs,omitempty"`
	Duration     int64             `json:"durationMs,omitempty"`
	// Aviso puntual para el mando (p. ej. resultado de un borrado).
	// El laptop lo pisa en la siguiente publicación sin aviso.
	Notice string    `json:"notice,omitempty"`
	At     time.Time `json:"at"`
}

type remoteSession struct {
	ID       string               `json:"sessionId"`
	Name     string               `json:"name"`
	Code     string               `json:"-"`
	LastSeen time.Time            `json:"lastSeen"`
	Pending  *remoteCommand       `json:"-"`
	State    *remotePlaybackState `json:"-"`
}

type remoteRegistry struct {
	mu sync.Mutex
	// userID -> sessionID -> sesión
	sessions map[string]map[string]*remoteSession
}

var remoteBox = &remoteRegistry{sessions: map[string]map[string]*remoteSession{}}

const remoteSessionTTL = 10 * time.Minute

func (rg *remoteRegistry) pruneLocked(userID string) {
	for id, s := range rg.sessions[userID] {
		if time.Since(s.LastSeen) > remoteSessionTTL {
			delete(rg.sessions[userID], id)
		}
	}
}

func (rg *remoteRegistry) getLocked(userID, sessionID string) *remoteSession {
	rg.pruneLocked(userID)
	return rg.sessions[userID][sessionID]
}

func remoteUserID(r *http.Request) (string, bool) {
	user, _ := request.UserFrom(r.Context())
	if user.ID == "" {
		return "", false
	}
	return user.ID, true
}

func writeRemoteJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func newSessionCode() string {
	var b [2]byte
	_, _ = rand.Read(b[:])
	return fmt.Sprintf("%04d", (int(b[0])<<8|int(b[1]))%10000)
}

func newSessionID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return fmt.Sprintf("%x", b[:])
}

func announceRemoteSession(w http.ResponseWriter, r *http.Request) {
	userID, ok := remoteUserID(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	name := body.Name
	if name == "" {
		name = "Reproductor web"
	}
	if len(name) > 64 {
		name = name[:64]
	}
	s := &remoteSession{
		ID:       newSessionID(),
		Name:     name,
		Code:     newSessionCode(),
		LastSeen: time.Now(),
	}
	remoteBox.mu.Lock()
	if remoteBox.sessions[userID] == nil {
		remoteBox.sessions[userID] = map[string]*remoteSession{}
	}
	remoteBox.sessions[userID][s.ID] = s
	remoteBox.mu.Unlock()
	writeRemoteJSON(w, http.StatusOK, map[string]string{
		"sessionId": s.ID,
		"code":      s.Code,
	})
}

func listRemoteSessions(w http.ResponseWriter, r *http.Request) {
	userID, ok := remoteUserID(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	remoteBox.mu.Lock()
	remoteBox.pruneLocked(userID)
	type item struct {
		SessionID string    `json:"sessionId"`
		Name      string    `json:"name"`
		LastSeen  time.Time `json:"lastSeen"`
		HasState  bool      `json:"hasState"`
	}
	items := []item{}
	for _, s := range remoteBox.sessions[userID] {
		items = append(items, item{
			SessionID: s.ID,
			Name:      s.Name,
			LastSeen:  s.LastSeen,
			HasState:  s.State != nil,
		})
	}
	remoteBox.mu.Unlock()
	writeRemoteJSON(w, http.StatusOK, items)
}

func checkRemoteAccess(userID, sessionID, code string) *remoteSession {
	remoteBox.mu.Lock()
	defer remoteBox.mu.Unlock()
	s := remoteBox.getLocked(userID, sessionID)
	if s == nil || s.Code != code {
		return nil
	}
	s.LastSeen = time.Now()
	return s
}

func postRemoteCommand(w http.ResponseWriter, r *http.Request) {
	userID, ok := remoteUserID(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var body struct {
		SessionID string          `json:"sessionId"`
		Code      string          `json:"code"`
		Action    string          `json:"action"`
		Payload   json.RawMessage `json:"payload"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if !remoteActions[body.Action] {
		http.Error(w, "unknown action", http.StatusUnprocessableEntity)
		return
	}
	s := checkRemoteAccess(userID, body.SessionID, body.Code)
	if s == nil {
		http.Error(w, "invalid session or code", http.StatusForbidden)
		return
	}
	cmd := &remoteCommand{ID: newSessionID(), Action: body.Action, Payload: body.Payload, At: time.Now()}
	remoteBox.mu.Lock()
	s.Pending = cmd
	remoteBox.mu.Unlock()
	events.GetBroker().SendBroadcastMessage(r.Context(), &events.RemoteCommand{
		ID:        cmd.ID,
		SessionID: body.SessionID,
		Action:    body.Action,
		Payload:   string(body.Payload),
	})
	w.WriteHeader(http.StatusNoContent)
}

func getRemotePending(w http.ResponseWriter, r *http.Request) {
	userID, ok := remoteUserID(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	q := r.URL.Query()
	s := checkRemoteAccess(userID, q.Get("sessionId"), q.Get("code"))
	if s == nil {
		http.Error(w, "invalid session or code", http.StatusForbidden)
		return
	}
	remoteBox.mu.Lock()
	cmd := s.Pending
	s.Pending = nil
	remoteBox.mu.Unlock()
	if cmd == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	writeRemoteJSON(w, http.StatusOK, cmd)
}

func postRemoteState(w http.ResponseWriter, r *http.Request) {
	userID, ok := remoteUserID(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var body struct {
		SessionID string              `json:"sessionId"`
		Code      string              `json:"code"`
		State     remotePlaybackState `json:"state"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	s := checkRemoteAccess(userID, body.SessionID, body.Code)
	if s == nil {
		http.Error(w, "invalid session or code", http.StatusForbidden)
		return
	}
	body.State.At = time.Now()
	remoteBox.mu.Lock()
	s.State = &body.State
	remoteBox.mu.Unlock()
	events.GetBroker().SendBroadcastMessage(r.Context(), &events.RemoteState{
		SessionID: body.SessionID,
		TrackID:   body.State.TrackID,
		Title:     body.State.Title,
		Artist:    body.State.Artist,
		Playing:   body.State.Playing,
	})
	w.WriteHeader(http.StatusNoContent)
}

func getRemoteState(w http.ResponseWriter, r *http.Request) {
	userID, ok := remoteUserID(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	q := r.URL.Query()
	// Leer el estado NO exige código (es tu propia biblioteca); comandar sí.
	remoteBox.mu.Lock()
	s := remoteBox.getLocked(userID, q.Get("sessionId"))
	remoteBox.mu.Unlock()
	if s == nil {
		http.Error(w, "no state", http.StatusNotFound)
		return
	}
	if s.State == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	writeRemoteJSON(w, http.StatusOK, s.State)
}

func leaveRemoteSession(w http.ResponseWriter, r *http.Request) {
	userID, ok := remoteUserID(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var body struct {
		SessionID string `json:"sessionId"`
		Code      string `json:"code"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	remoteBox.mu.Lock()
	if s := remoteBox.getLocked(userID, body.SessionID); s != nil && s.Code == body.Code {
		delete(remoteBox.sessions[userID], body.SessionID)
	}
	remoteBox.mu.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

func (api *Router) addRemoteRoute(r chi.Router) {
	r.Route("/remote", func(r chi.Router) {
		r.Post("/announce", announceRemoteSession)
		r.Get("/sessions", listRemoteSessions)
		r.Post("/command", postRemoteCommand)
		r.Get("/pending", getRemotePending)
		r.Post("/state", postRemoteState)
		r.Get("/state", getRemoteState)
		r.Post("/leave", leaveRemoteSession)
	})
}
