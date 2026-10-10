import React from 'react'
import { useTranslate } from 'react-admin'
import {
  Button,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
  makeStyles,
} from '@material-ui/core'
import CloudDownloadIcon from '@material-ui/icons/CloudDownload'
import '../home/home.css'
import PhonelinkIcon from '@material-ui/icons/Phonelink'
import RadioIcon from '@material-ui/icons/Radio'
import ShuffleIcon from '@material-ui/icons/Shuffle'

const useStyles = makeStyles((theme) => ({
  root: { padding: theme.spacing(2), maxWidth: 720, margin: '0 auto' },
  card: { marginBottom: theme.spacing(2) },
  heading: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(1),
  },
  icon: { color: theme.palette.primary.main },
  step: { paddingLeft: 0, paddingRight: 0 },
  note: { marginTop: theme.spacing(1) },
}))

const Section = ({ icon, title, children }) => {
  const classes = useStyles()
  return (
    <Card className={classes.card}>
      <CardContent>
        <div className={classes.heading}>
          <span className={classes.icon}>{icon}</span>
          <Typography variant="h6">{title}</Typography>
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

// Página completa de ayuda. La bienvenida emergente vive en HelpWelcome y
// se monta desde el menú, así que aquí NO se repite el diálogo.
const HelpView = () => {
  const classes = useStyles()
  const translate = useTranslate()

  return (
    <div className={`${classes.root} mm-home`}>
      <Typography variant="h5" gutterBottom>
        {translate('menu.help', { _: 'Ayuda' })}
      </Typography>

      <Section
        icon={<RadioIcon />}
        title={translate('help.autodj.title', { _: 'Auto-DJ y continuación' })}
      >
        <Typography paragraph>
          {translate('help.autodj.body', {
            _: 'Al terminar la cola, la música sigue sola: primero con temas del mismo género; si no hay, del mismo artista; y si no, aleatorios de la biblioteca.',
          })}
        </Typography>
        <Typography color="textSecondary">
          {translate('help.autodj.toggle', {
            _: 'Usa el botón 📻 del reproductor para activarlo o desactivarlo.',
          })}
        </Typography>
      </Section>

      <Section
        icon={<ShuffleIcon />}
        title={translate('help.shuffle.title', {
          _: 'Modo aleatorio (shuffle)',
        })}
      >
        <Typography paragraph>
          {translate('help.shuffle.body', {
            _: 'Con 🔀 activado, la continuación elige canciones al azar de toda la biblioteca en lugar de mantenerse en el mismo género o artista.',
          })}
        </Typography>
      </Section>

      <Section
        icon={<PhonelinkIcon />}
        title={translate('help.remote.title', {
          _: 'Emparejar el móvil como mando',
        })}
      >
        <List>
          <ListItem className={classes.step}>
            <ListItemIcon>1</ListItemIcon>
            <ListItemText
              primary={translate('help.remote.step1', {
                _: 'En el laptop, pulsa 📱 en el reproductor y anota el código de 4 dígitos.',
              })}
            />
          </ListItem>
          <ListItem className={classes.step}>
            <ListItemIcon>2</ListItemIcon>
            <ListItemText
              primary={translate('help.remote.step2', {
                _: 'En el móvil, abre Control remoto, elige la sesión y escribe el código.',
              })}
            />
          </ListItem>
          <ListItem className={classes.step}>
            <ListItemIcon>3</ListItemIcon>
            <ListItemText
              primary={translate('help.remote.step3', {
                _: 'Busca una canción y tócala: el audio suena siempre en el laptop, nunca en el móvil.',
              })}
            />
          </ListItem>
        </List>
      </Section>

      <Section
        icon={<CloudDownloadIcon />}
        title={translate('help.downloader.title', {
          _: 'Downloader y cola de revisión',
        })}
      >
        <Typography paragraph>
          {translate('help.downloader.body', {
            _: 'El enlace Downloader abre la cola de revisión de descargas en /downloader.',
          })}
        </Typography>
        <Typography className={classes.note} color="textSecondary">
          {translate('help.downloader.lan', {
            _: 'Solo está disponible dentro de la red local (LAN). No se expone a través del túnel público: si abres Navidrome desde fuera de casa, el Downloader no cargará.',
          })}
        </Typography>
        <Button
          component="a"
          href="/downloader"
          color="primary"
          startIcon={<CloudDownloadIcon />}
        >
          {translate('menu.downloader', { _: 'Downloader' })}
        </Button>
      </Section>
    </div>
  )
}

export default HelpView
