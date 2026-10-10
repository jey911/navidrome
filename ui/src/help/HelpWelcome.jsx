import React, { useState } from 'react'
import { useTranslate } from 'react-admin'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@material-ui/core'
import InfoOutlinedIcon from '@material-ui/icons/InfoOutlined'
import PhonelinkIcon from '@material-ui/icons/Phonelink'
import RadioIcon from '@material-ui/icons/Radio'
import ShuffleIcon from '@material-ui/icons/Shuffle'
import config from '../config'
import { dismissWelcome, readWelcomeDismissed } from './help'

// Bienvenida nativa: se monta desde el menú (presente tras el login) para
// que aparezca sola una vez por versión, sin depender de que el usuario
// entre a la página de Ayuda. La página completa vive en HelpView.
const HelpWelcome = () => {
  const translate = useTranslate()
  const [open, setOpen] = useState(() => !readWelcomeDismissed())

  const close = () => {
    dismissWelcome()
    setOpen(false)
  }

  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth>
      <DialogTitle>
        {translate('help.welcome.title', {
          _: 'Bienvenido a Navidrome',
        })}
      </DialogTitle>
      <DialogContent>
        <DialogContentText>
          {translate('help.welcome.version', {
            _: 'Versión {{version}}. Estas son las novedades de casa:',
            version: config.version,
          })}
        </DialogContentText>
        <Divider />
        <List dense>
          <ListItem>
            <ListItemIcon>
              <RadioIcon />
            </ListItemIcon>
            <ListItemText
              primary={translate('help.welcome.autodj', {
                _: 'Auto-DJ: al acabar la cola sigue con tu estilo.',
              })}
            />
          </ListItem>
          <ListItem>
            <ListItemIcon>
              <ShuffleIcon />
            </ListItemIcon>
            <ListItemText
              primary={translate('help.welcome.shuffle', {
                _: 'Shuffle: continuación aleatoria de toda la biblioteca.',
              })}
            />
          </ListItem>
          <ListItem>
            <ListItemIcon>
              <PhonelinkIcon />
            </ListItemIcon>
            <ListItemText
              primary={translate('help.welcome.remote', {
                _: 'Control remoto: el móvil como mando del laptop.',
              })}
            />
          </ListItem>
          <ListItem>
            <ListItemIcon>
              <InfoOutlinedIcon />
            </ListItemIcon>
            <ListItemText
              primary={translate('help.welcome.downloader', {
                _: 'Downloader en /downloader: cola de revisión, solo en LAN.',
              })}
            />
          </ListItem>
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} color="primary">
          {translate('help.welcome.dismiss', { _: 'Entendido' })}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default HelpWelcome
