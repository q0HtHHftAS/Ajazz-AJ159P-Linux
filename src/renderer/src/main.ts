import { createApp } from 'vue';
import { createI18n } from 'vue-i18n';
import App from './App.vue';
import './assets/main.css';
import en from '../../../locales/en.json';

const i18n = createI18n({
	legacy: false,
	globalInjection: true,
	locale: 'en',
	messages: { en },
});

const app = createApp(App);
app.use(i18n);
app.mount('#app');
